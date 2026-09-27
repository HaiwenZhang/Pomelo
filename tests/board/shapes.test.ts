import { test, expect } from "vitest";

import type { Segment } from "../../src/lib/board/model";
import { PadShape } from "../../src/lib/board/shapes/pad";
import { PathShape } from "../../src/lib/board/shapes/path";
import { PolygonShape } from "../../src/lib/board/shapes/polygon";
import { SegmentShape } from "../../src/lib/board/shapes/segment";

test("a segment shape keeps board-space geometry and replaces supplied scratch bounds", () => {
  const segment: Segment = {
    id: 1,
    trackId: 1,
    layer: 0,
    net: 0,
    a: [0, 0],
    b: [4, 0],
    width: 2,
  };
  const shape = new SegmentShape(segment);
  const bounds = { minX: 99, minY: 99, maxX: 99, maxY: 99 };
  expect(shape.bounds(bounds)).toBe(bounds);
  expect(bounds).toStrictEqual({ minX: -1, minY: -1, maxX: 5, maxY: 1 });
  expect(shape.distance([2, 3])).toBe(3);
});

test("pad instances share local meshes while applying placement independently", () => {
  const custom: [number, number][][] = [
    [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ],
  ];
  const data = {
    layer: 0,
    type: 0,
    width: 2,
    height: 2,
    offset: [0, 0] as [number, number],
    custom,
  };
  const first = new PadShape(data),
    second = new PadShape(data);
  expect(first.mesh()).toBe(second.mesh());
  expect(first.bounds({ at: [10, 20] })).toStrictEqual({
    minX: 10,
    minY: 20,
    maxX: 12,
    maxY: 22,
  });
  expect(second.bounds({ at: [0, 0] })).toStrictEqual({
    minX: 0,
    minY: 0,
    maxX: 2,
    maxY: 2,
  });
  expect(first.distance([11, 21], { at: [10, 20] })).toBe(-1);
});

test("path and polygon shapes agree on a closed contour without a parser", () => {
  const ring: [number, number][] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [0, 4],
  ];
  const path = new PathShape(
    ring.map((a, i) => ({
      id: i,
      trackId: i,
      layer: 0,
      net: 0,
      width: 0,
      a,
      b: ring[(i + 1) % ring.length],
    })),
  );
  const polygon = new PolygonShape([ring]);
  expect(path.contains([2, 2])).toBe(true);
  expect(polygon.contains([2, 2])).toBe(true);
  expect(path.contains([5, 2])).toBe(false);
  expect(path.flatten()).toStrictEqual(ring);
  expect(polygon.triangulate().indices.length).toBe(6);
});
