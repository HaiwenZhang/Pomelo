import { test, expect } from "vitest";

import { AllegroTextRecordDecoder } from "../../src/lib/allegro/decoders/text-record";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene } from "../../src/lib/board/model";

import { BoardTextStrokeBuilder } from "../../src/lib/text/board-text-stroke-builder";
import { BoardTextBatchBuilder } from "../../src/lib/render/board-text-batch-builder";
import { PositionPrecision } from "../../src/lib/render/position-precision";

const scene: BoardScene = {
  layers: [{ id: 0, name: "TOP", color: "#548abc" }],
  drawingLayers: [
    { id: 1024, name: "Silk", color: "#e5d19a", defaultVisible: true },
  ],
  segments: [],
  vias: [],
  pins: [],
  zones: [],
  outline: [],
  nets: new Map(),
  diagnostics: [],
  bounds: { minX: 200000, minY: -400000, maxX: 200002, maxY: -399998 },
  texts: Array.from({ length: 300 }, (_, i) => ({
    ...new AllegroTextRecordDecoder(1).decode(
      {
        Key: i,
        Layer: 6,
        Font: 0x10001,
        CoordsX: 200000 + i * 0.013,
        CoordsY: -400000 + i * 0.007,
        Rotation: (i % 4) * 45000,
      },
      { Value: i % 2 ? "R25\n1.0k" : "ABC 123" },
      {
        Width: 0.76,
        Height: 1,
        CharacterSpace: 0.1,
        LineSpace: 1.4,
        StrokeWidth: 0.04,
      },
    ),
    layer: i % 2 ? 0 : 1024,
    mirrored: i % 3 === 0,
  })),
};

test("original board text is hidden by default and can be enabled", () => {
  const display = BoardDisplay.createDisplayOptions(scene.drawingLayers);
  expect(display.boardText).toBe(false);
  expect(
    BoardDisplay.isBatchVisible(display, { layer: 0, category: "text" }),
  ).toBe(false);
  expect(
    [...BoardTextBatchBuilder.buildSteps(scene, display)].filter(Boolean),
  ).toHaveLength(0);
  expect(
    BoardDisplay.isBatchVisible(
      { ...display, boardText: true },
      { layer: 0, category: "text" },
    ),
  ).toBe(true);
  expect(
    [
      ...BoardTextBatchBuilder.buildSteps(scene, {
        ...display,
        boardText: true,
      }),
    ].filter(Boolean).length,
  ).toBeGreaterThan(0);
});

test("bounded text batches preserve every legacy vertex, residual, color and layer order", () => {
  const reference = new Map<number, number[]>();
  for (const text of scene.texts) {
    const layer = [...scene.layers, ...scene.drawingLayers].find(
      (l) => l.id === text.layer,
    )!;
    let values = reference.get(layer.id);
    if (!values) {
      values = [];
      reference.set(layer.id, values);
    }
    const color = [1, 3, 5].map(
      (i) => parseInt(layer.color.slice(i, i + 2), 16) / 255,
    );
    for (const s of BoardTextStrokeBuilder.build(text))
      values.push(
        s.a[0] - 200001,
        s.a[1] + 399999,
        s.b[0] - 200001,
        s.b[1] + 399999,
        s.width,
        0,
        0,
        0,
        ...color,
        1,
      );
  }
  const batches = [
    ...BoardTextBatchBuilder.buildSteps(scene, undefined, 13),
  ].filter((b) => !!b);
  expect(batches.length > 20).toBeTruthy();
  expect([...new Set(batches.map((b) => b.layer))]).toStrictEqual([
    ...reference.keys(),
  ]);
  for (const [layer, values] of reference) {
    const expected = PositionPrecision.split(values, 12, 4),
      actual = batches.filter((b) => b.layer === layer);
    expect(new Float32Array(actual.flatMap((b) => [...b.data]))).toStrictEqual(
      expected.data,
    );
    expect(
      new Float32Array(actual.flatMap((b) => [...b.residual])),
    ).toStrictEqual(expected.residual);
  }
  expect(
    batches.every(
      (b) => b.data.byteLength <= 13 * 48 && b.residual.byteLength <= 13 * 16,
    ),
  ).toBeTruthy();
});

test("text preparation yields, filters hidden layers and can stop before building the rest", () => {
  const display = {
      ...BoardDisplay.createDisplayOptions(),
      boardText: true,
      hidden: new Set([1024]),
    },
    steps = BoardTextBatchBuilder.buildSteps(scene, display, 13);
  let checkpoints = 0,
    batches = 0;
  for (const batch of steps) {
    if (!batch) checkpoints++;
    else {
      expect(batch.layer).toBe(0);
      if (++batches === 2) {
        steps.return(undefined);
        break;
      }
    }
  }
  expect(checkpoints > 0).toBeTruthy();
  expect(batches).toBe(2);
  expect(steps.next().done).toBe(true);
  expect(
    [
      ...BoardTextBatchBuilder.buildSteps(scene, {
        ...display,
        boardText: false,
      }),
    ].every((b) => !b),
  ).toBeTruthy();
  expect(() => [
    ...BoardTextBatchBuilder.buildSteps(scene, undefined, 0),
  ]).toThrow(/batch size/);
});
