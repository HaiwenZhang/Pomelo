import { test, expect } from "vitest";

import { ShapeTransform } from "../../src/lib/board/shapes/transform";
import type { Segment } from "../../src/lib/board/model";

test("should mirror the local Y axis before rotation when placing an analytic arc", () => {
  const source: Segment = {
    id: 7,
    trackId: 9,
    layer: 2,
    net: 3,
    width: 0.2,
    a: [2, 0],
    b: [0, 2],
    arc: { center: [0, 0], radius: 2, start: 0, sweep: Math.PI / 2 },
  };
  const result = new ShapeTransform([10, 20], 0, true).segment(source);
  expect(result.a).toStrictEqual([12, 20]);
  expect(result.b).toStrictEqual([10, 18]);
  expect(result.arc).toStrictEqual({
    center: [10, 20],
    radius: 2,
    start: 0,
    sweep: -Math.PI / 2,
  });
  expect(result.id).toBe(7);
  expect(source.b).toStrictEqual([0, 2]);
});
