import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type {
  BoardScene,
  PadShape,
  Pin,
  Point,
  Segment,
  Via,
} from "../../src/lib/board/model";
import { PadShape as PadShapeGeometry } from "../../src/lib/board/shapes/pad";
import { PathShape } from "../../src/lib/board/shapes/path";

import { BoardIndex } from "../../src/lib/interaction/picking";
import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";

const scene = (patch: Partial<BoardScene>): BoardScene => ({
  layers: [{ id: 0, name: "TOP", color: "#40a080" }],
  nets: new Map(),
  segments: [],
  vias: [],
  pins: [],
  zones: [],
  texts: [],
  drawingLayers: [],
  outline: [],
  diagnostics: [],
  bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  ...patch,
});
const pin = (pad: PadShape): Pin => ({
  id: 1,
  net: 0,
  reference: "J1",
  name: "1",
  at: [0, 0],
  angle: 0,
  back: false,
  drill: 0,
  shapes: [pad],
});

test("reusable pad bounds overwrite every coordinate when alternating pad types and owners", () => {
  const scratch = { minX: -1e10, minY: -1e10, maxX: 1e10, maxY: 1e10 };
  const pad: PadShape = {
    layer: 0,
    type: 2,
    width: 2,
    height: 2,
    offset: [0, 0],
  };
  const first = new PadShapeGeometry(pad).bounds({ at: [10, 20] });
  expect(new PadShapeGeometry(pad).bounds({ at: [10, 20] }, scratch)).toBe(
    scratch,
  );
  expect(scratch).toStrictEqual({ minX: 9, minY: 19, maxX: 11, maxY: 21 });
  const custom: PadShape = {
    ...pad,
    type: 22,
    custom: [
      [
        [0, 1],
        [2, 3],
        [-1, -2],
      ],
    ],
    offset: [2, 3],
  };
  new PadShapeGeometry(custom).bounds({ at: [30, 40], back: true }, scratch);
  expect(scratch).toStrictEqual({ minX: 31, minY: 40, maxX: 34, maxY: 45 });
  new PadShapeGeometry({ ...pad, type: 6, width: 8, height: 4 }).bounds(
    { at: [0, 0] },
    scratch,
  );
  expect(scratch).toStrictEqual({ minX: -4, minY: -2, maxX: 4, maxY: 2 });
  new PadShapeGeometry(pad).bounds({ at: [-10, -20] }, scratch);
  expect(scratch).toStrictEqual({ minX: -11, minY: -21, maxX: -9, maxY: -19 });
  expect(first).toStrictEqual({ minX: 9, minY: 19, maxX: 11, maxY: 21 });
});

test("non-round vias use the same rounded/chamfered pad geometry as component pins", () => {
  const pad: PadShape = {
    layer: 0,
    type: 11,
    width: 4,
    height: 1,
    offset: [0.2, 0.3],
  };
  const via: Via = {
    id: 2,
    net: 0,
    at: [0, 0],
    drill: 0,
    padstack: 0,
    startLayer: 0,
    endLayer: 0,
    pads: [pad],
  };
  const board = scene({ vias: [via] }),
    batch = new PrimitiveBatchBuilder(board)
      .build()
      .find((b) => b.category === "via" && b.data.length)!;
  expect(batch.data.length).toBe(12);
  expect(batch.data[6]).toBe(4);
  expect(batch.data[5]).toBe(0.5);
  expect(new PadShapeGeometry({ ...pad, type: 27, corner: 8 }).corner()).toBe(
    0.5,
  );
  expect(
    new PadShapeGeometry({
      ...pad,
      type: 2,
      width: 2,
      height: 0,
      offset: [0, 0],
    }).bounds({
      at: [0, 0],
      angle: Math.PI / 4,
    }),
  ).toStrictEqual({ minX: -1, minY: -1, maxX: 1, maxY: 1 });
  const index = new BoardIndex(board),
    display = { ...BoardDisplay.createDisplayOptions(), filled: true };
  expect(index.pick([1.7, 0.3], 100, display)?.object.value.id).toBe(2);
  expect(index.pick([2.2, 0.8], 100, display)).toBe(null);
  expect(index.pick([0.2, 0.3], 100, { ...display, filled: false })).toBe(null);
});

test("rotated slots render and pick their full envelope while remaining independent of pads", () => {
  const p = {
    ...pin({ layer: 0, type: 6, width: 6, height: 3, offset: [0, 0] }),
    angle: Math.PI / 2,
    drill: 0.3,
    drillShape: { width: 4, height: 1, plated: true },
  };
  const board = scene({ pins: [p] }),
    hole = new PrimitiveBatchBuilder(board)
      .build()
      .find((b) => b.category === "drill")!;
  expect(hole.data[6]).toBe(6);
  expect(hole.data[2]).toBe(2);
  expect(hole.data[3]).toBe(0.5);
  expect(Math.abs(hole.data[4] - Math.PI / 2) < 1e-7).toBeTruthy();
  const index = new BoardIndex(board),
    display = { ...BoardDisplay.createDisplayOptions(), pins: false };
  expect(index.pick([0, 1.5], 100, display)?.category).toBe("drill");
  expect(index.pick([0.8, 0], 100, display)).toBe(null);
  expect(index.pick([0, 1.5], 100, { ...display, drills: false })).toBe(null);
});

test("custom pad fill/outline switch preserves holes and highlight outlines", () => {
  const custom: Point[][] = [
    [
      [-2, -2],
      [2, -2],
      [2, 2],
      [-2, 2],
    ],
    [
      [-0.5, -0.5],
      [-0.5, 0.5],
      [0.5, 0.5],
      [0.5, -0.5],
    ],
  ];
  const pad: PadShape = {
    layer: 0,
    type: 22,
    width: 4,
    height: 4,
    offset: [0, 0],
    custom,
  };
  const board = scene({ pins: [pin(pad)] }),
    batches = new PrimitiveBatchBuilder(board)
      .build()
      .filter((b) => b.category === "pin" && b.data.length),
    display = BoardDisplay.createDisplayOptions();
  expect(
    batches
      .filter((b) => BoardDisplay.isBatchVisible(display, b))
      .map((b) => b.padMode),
  ).toStrictEqual(["outline"]);
  display.filled = true;
  expect(
    batches
      .filter((b) => BoardDisplay.isBatchVisible(display, b))
      .map((b) => b.padMode),
  ).toStrictEqual(["filled"]);
  expect(
    batches.filter((b) => BoardDisplay.isBatchVisible(display, b, true)).length,
  ).toBe(2);
  const index = new BoardIndex(board);
  expect(index.pick([0, 0], 100, display)).toBe(null);
  expect(index.pick([1, 1], 100, display)).toBeTruthy();
  expect(index.pick([1, 1], 100, { ...display, filled: false })).toBe(null);
  expect(index.pick([2, 0], 100, { ...display, filled: false })).toBeTruthy();
  expect(new PadShapeGeometry(pad).mesh()).toBe(
    new PadShapeGeometry({ ...pad }).mesh(),
  );
});

test("custom pad outlines retain analytic arcs through offset, rotation and backside mirroring", () => {
  const arc: Segment = {
    id: 1,
    trackId: 0,
    layer: 0,
    net: 0,
    a: [1, 0],
    b: [1, 0],
    width: 0,
    arc: { center: [0, 0], radius: 1, start: 0, sweep: Math.PI * 2 },
  };
  const pad: PadShape = {
    layer: 0,
    type: 22,
    width: 2,
    height: 2,
    offset: [2, 3],
    custom: [new PathShape([arc]).flatten()],
    customPaths: [[arc]],
  };
  const owner = {
    ...pin(pad),
    at: [10, 20] as Point,
    angle: Math.PI / 2,
    back: true,
  };
  expect(new PadShapeGeometry(pad).toWorld([0, 1], owner)).toStrictEqual([
    13, 23,
  ]);
  const edge = new PadShapeGeometry(pad).edges(owner)[0];
  expect(edge.arc?.center).toStrictEqual([12, 23]);
  expect(edge.arc?.sweep).toBe(-Math.PI * 2);
  const outline = new PrimitiveBatchBuilder(scene({ pins: [owner] }))
    .build()
    .find((b) => b.category === "pin" && b.padMode === "outline")!;
  expect(outline.arcs).toBe(true);
  expect(outline.data.length).toBe(20);
  expect(outline.data[16]).toBe(-1);
  expect(outline.data[18]).toBe(1);
});
