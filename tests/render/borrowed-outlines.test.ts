import { test, expect } from "vitest";
import type { BoardScene } from "../../src/lib/board/model";
import type { Zone } from "../../src/lib/board/model";

import { BorrowedOutlineCollector } from "../../src/lib/render/borrowed-outline-collector";
import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";

test("borrowed outlines retain line-before-arc order and merge only contiguous selected ranges", () => {
  const line = { arcs: false },
    arc = { arcs: true };
  const index = new Map([
    [1, [{ batch: arc, start: 0, count: 3 }]],
    [
      2,
      [
        { batch: line, start: 0, count: 4 },
        { batch: arc, start: 3, count: 2 },
      ],
    ],
    [3, [{ batch: line, start: 4, count: 6 }]],
    [4, [{ batch: line, start: 10, count: 2 }]],
    [
      5,
      [
        { batch: line, start: 12, count: 7 },
        { batch: arc, start: 5, count: 1 },
      ],
    ],
  ]);
  const original = structuredClone([...index]);
  const result = [
    ...BorrowedOutlineCollector.collectSteps([1, 2, 3, 5], index),
  ].filter(Boolean);
  expect(result).toStrictEqual([
    { batch: line, start: 0, count: 10 },
    { batch: line, start: 12, count: 7 },
    { batch: arc, start: 0, count: 6 },
  ]);
  expect([...index]).toStrictEqual(original);
  const steps = BorrowedOutlineCollector.collectSteps(
    Array.from({ length: 1000 }, () => 2),
    index,
  );
  expect(steps.next().done).toBe(false);
  steps.return(undefined);
  expect(steps.next().done).toBe(true);
});

test("reuse markers avoid traversing copper paths and keep their original submission position", () => {
  const zone: Zone = {
    id: 9,
    layer: 0,
    net: 1,
    rings: [],
    points: new Float64Array(),
    indices: new Uint32Array(),
    get paths(): Zone["paths"] {
      throw Error("Borrowed outlines must not rebuild paths");
    },
  };
  const scene: BoardScene = {
    layers: [{ id: 0, name: "TOP", color: "#40ffff" }],
    nets: new Map(),
    segments: [
      { id: 1, trackId: 1, layer: 0, net: 1, a: [0, 0], b: [1, 0], width: 0.1 },
    ],
    vias: [],
    pins: [],
    zones: [zone],
    texts: [],
    drawingLayers: [],
    outline: [],
    diagnostics: [],
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  };
  const batches = [
    ...new PrimitiveBatchBuilder(scene).buildSteps({
      kind: "selection",
      reuseOutlines: true,
    }),
  ].filter(
    (b) => b && (b.data.length || b.zones?.length || b.outlineRefs?.length),
  );
  expect(batches.map((b) => b!.category)).toStrictEqual([
    "zone",
    "zone-outline",
    "etch",
  ]);
  expect(batches[1]!.outlineRefs).toStrictEqual([9]);
  expect(batches[1]!.data.length).toBe(0);
});
