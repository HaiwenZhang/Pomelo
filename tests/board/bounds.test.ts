import { expect, test } from "vitest";
import { BoundsAccumulator } from "../../src/lib/board/bounds";
import type { Pin } from "../../src/lib/board/model";
import { SegmentShape } from "../../src/lib/board/shapes/segment";

test("bounds include arc extrema and round stroke caps rather than only endpoints", () => {
  const bounds = new BoundsAccumulator();
  bounds.includeSegment(SegmentShape.fromPoints([2, 0], [-2, 0], 1, [0, 0]));
  expect(bounds.bounds).toEqual({
    minX: -2.5,
    minY: -0.5,
    maxX: 2.5,
    maxY: 2.5,
  });
  expect(bounds.finite).toBe(true);
});

test("owner bounds include a rotated slot even when the copper is smaller", () => {
  const bounds = new BoundsAccumulator();
  const pin: Pin = {
    id: 1,
    net: 0,
    name: "",
    reference: "",
    at: [10, 20],
    angle: Math.PI / 2,
    back: false,
    drill: 1,
    drillShape: { width: 6, height: 1, plated: true },
    shapes: [{ layer: 0, type: 2, width: 2, height: 2, offset: [0, 0] }],
  };
  bounds.includePadOwner(pin);
  expect(bounds.bounds.minX).toBeCloseTo(9);
  expect(bounds.bounds.maxX).toBeCloseTo(11);
  expect(bounds.bounds.minY).toBeCloseTo(17);
  expect(bounds.bounds.maxY).toBeCloseTo(23);
});

test("empty builders do not expand bounds and changing fit retains the published object", () => {
  const bounds = new BoundsAccumulator();
  const published = bounds.bounds;
  expect(bounds.finite).toBe(false);
  bounds.include(new BoundsAccumulator().bounds);
  bounds.includePoint([100, 200]);
  const document = { ...bounds.bounds };
  bounds.reset({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  bounds.includePoint([-1, 5]);
  expect(bounds.bounds).toBe(published);
  expect(bounds.bounds).toEqual({ minX: -1, minY: 0, maxX: 10, maxY: 10 });
  expect(document).toEqual({ minX: 100, minY: 200, maxX: 100, maxY: 200 });
});
