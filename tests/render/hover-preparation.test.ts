import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene, PadShape } from "../../src/lib/board/model";

import type { PrimitiveBatch } from "../../src/lib/render/primitive-batch";
import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";

test("transient visible preparation preserves full-path geometry, order and hole scopes", () => {
  const pads: PadShape[] = [0, 1, 2].map((layer) => ({
    layer,
    type: 2,
    width: 1,
    height: 1,
    offset: [0, 0],
  }));
  const custom: PadShape = {
    layer: 1,
    type: 22,
    width: 2,
    height: 2,
    offset: [0, 0],
    custom: [
      [
        [0, 0],
        [2, 0],
        [0, 2],
      ],
    ],
  };
  const scene: BoardScene = {
    layers: [0, 1, 2].map((id) => ({ id, name: `L${id}`, color: "#406080" })),
    nets: new Map([[1, "GND"]]),
    segments: [0, 1, 2].flatMap((layer) => [
      {
        id: layer * 2,
        trackId: 1,
        layer,
        net: 1,
        a: [0, 0] as [number, number],
        b: [4, 0] as [number, number],
        width: 0.123456789,
      },
      {
        id: layer * 2 + 1,
        trackId: 1,
        layer,
        net: 1,
        a: [1, 0] as [number, number],
        b: [0, 1] as [number, number],
        width: 0.1,
        arc: {
          center: [0, 0] as [number, number],
          radius: 1,
          start: 0,
          sweep: Math.PI / 2,
        },
      },
    ]),
    vias: [
      {
        id: 7,
        net: 1,
        at: [2, 2],
        padstack: 1,
        drill: 0.2,
        startLayer: 0,
        endLayer: 2,
        pads,
      },
      {
        id: 8,
        net: 1,
        at: [3, 3],
        padstack: 2,
        drill: 0.1,
        startLayer: 1,
        endLayer: 2,
        pads: [custom, pads[2]],
      },
    ],
    pins: [
      {
        id: 9,
        net: 1,
        at: [4, 4],
        name: "1",
        reference: "U1",
        angle: 0.4,
        back: false,
        drill: 0.3,
        shapes: [custom, pads[0]],
      },
    ],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  };
  const before = structuredClone(scene),
    base = BoardDisplay.createDisplayOptions();
  const material = (steps: Iterable<PrimitiveBatch | undefined>) =>
    [...steps].filter((b): b is PrimitiveBatch => !!b && b.data.length > 0);
  const full = material(
    new PrimitiveBatchBuilder(scene).buildSteps({ kind: "selection" }),
  );
  const cases = [
    base,
    { ...base, hidden: new Set([0, 2]) },
    { ...base, hidden: new Set([0, 1, 2]) },
    { ...base, vias: false },
    { ...base, pins: false },
    { ...base, drills: false },
    { ...base, filled: true },
    BoardDisplay.setLayerVisibility(
      BoardDisplay.setLayerVisibility(base, 1, "via", false),
      0,
      "etch",
      false,
    ),
  ];
  for (const options of cases) {
    const actual = material(
      new PrimitiveBatchBuilder(scene).buildSteps({
        kind: "selection",
        visibility: options,
      }),
    );
    expect(actual).toStrictEqual(
      full.filter((b) => BoardDisplay.isBatchVisible(options, b, true)),
    );
  }
  const onlyL1 = material(
    new PrimitiveBatchBuilder(scene).buildSteps({
      kind: "selection",
      visibility: cases[1],
    }),
  );
  const bytes = (values: PrimitiveBatch[]) =>
    values.reduce((n, b) => n + b.data.byteLength + b.residual.byteLength, 0);
  expect(bytes(onlyL1) < bytes(full)).toBeTruthy();
  expect(
    scene,
    "Filtering must preserve physical padstack layers and source members",
  ).toStrictEqual(before);
});
