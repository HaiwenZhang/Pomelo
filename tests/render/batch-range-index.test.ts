import { test, expect } from "vitest";
import { BatchRangeIndex } from "../../src/lib/render/batch-range-index";
import { PositionPrecision } from "../../src/lib/render/position-precision";
import type { PrimitiveBatch } from "../../src/lib/render/primitive-batch";

function index(batch: PrimitiveBatch) {
  const steps = BatchRangeIndex.buildSteps(batch);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value!;
}
function ranges(
  index: BatchRangeIndex,
  view: { minX: number; minY: number; maxX: number; maxY: number },
  first?: number,
  count?: number,
) {
  const result: number[][] = [];
  index.visible(
    view,
    (start, length) => result.push([start, length]),
    first,
    count,
  );
  return result;
}
const view = { minX: -2, minY: -2, maxX: 2, maxY: 2 };
test("range culling preserves translucent submission order, merges fit ranges and clips borrowed selections", () => {
  const values = [];
  for (let i = 0; i < 96; i++)
    values.push(i < 32 || i >= 64 ? 0 : 100, 0, 1, 0, 0, 0, 2, 0, 1, 0, 0, 1);
  const tree = index({
    layer: 0,
    category: "pin",
    ...PositionPrecision.split(values, 12, 4),
  });
  expect(ranges(tree, view)).toEqual([
    [0, 32],
    [64, 32],
  ]);
  expect(ranges(tree, view, 20, 50)).toEqual([
    [20, 12],
    [64, 6],
  ]);
  expect(
    ranges(tree, { minX: -200, minY: -200, maxX: 200, maxY: 200 }),
  ).toEqual([[0, 96]]);
  expect(ranges(tree, { minX: 300, minY: 300, maxX: 400, maxY: 400 })).toEqual(
    [],
  );
});
test("rotated pads and thick lines intersecting the view survive even with centers outside", () => {
  const values = [];
  for (let i = 0; i < 32; i++)
    values.push(4, 0, 1, 5, Math.PI / 2, 0, 4, 0, 1, 0, 0, 1);
  for (let i = 0; i < 32; i++)
    values.push(4, -100, 4, 100, 5, 0, 0, 0, 1, 0, 0, 1);
  const tree = index({
    layer: 0,
    category: "etch",
    ...PositionPrecision.split(values, 12, 4),
  });
  expect(ranges(tree, view)).toEqual([[0, 64]]);
});
test("range bounds retain float residuals at microscope scale", () => {
  const values = [];
  for (let i = 0; i < 64; i++)
    values.push(100000000.125, 0, 0.001, 0, 0, 0, 2, 0, 1, 0, 0, 1);
  const tree = index({
    layer: 0,
    category: "via",
    ...PositionPrecision.split(values, 12, 4),
  });
  expect(
    ranges(tree, {
      minX: 100000000.124,
      minY: -0.01,
      maxX: 100000000.126,
      maxY: 0.01,
    }),
  ).toEqual([[0, 64]]);
  expect(
    ranges(tree, {
      minX: 99999999.999,
      minY: -0.01,
      maxX: 100000000.001,
      maxY: 0.01,
    }),
  ).toEqual([]);
});
test("polygon ranges stay on triangle boundaries and include intersecting triangles", () => {
  const values = [];
  for (let i = 0; i < 64; i++)
    for (const [x, y] of [
      [-10, 0],
      [10, 0],
      [0, 10],
    ])
      values.push(x + (i < 32 ? 0 : 100), y, 1, 0, 0, 1);
  const tree = index({
    layer: 0,
    category: "pin",
    triangles: true,
    ...PositionPrecision.split(values, 6, 2),
  });
  expect(ranges(tree, view)).toEqual([[0, 96]]);
});

test("arc bounds keep an intersecting sweep even when its center is outside the viewport", async () => {
  const { ArcBatchBuilder } =
    await import("../../src/lib/render/arc-batch-builder");
  const values = [];
  for (let i = 0; i < 64; i++)
    values.push(i < 32 ? 0 : 100, 0, 10, 0, 1, Math.PI / 2, 1, 0, 1, 0, 0, 1);
  const batch = ArcBatchBuilder.build(
    { layer: 0, category: "etch" },
    values,
  ).find((b) => b.arcs)!;
  expect(ranges(index(batch), { minX: 6, minY: 6, maxX: 8, maxY: 8 })).toEqual([
    [0, 32],
  ]);
});
