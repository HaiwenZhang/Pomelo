import { test, expect } from "vitest";

import type { Segment } from "../../src/lib/board/model";
import { PathShape } from "../../src/lib/board/shapes/path";
import { PointShape } from "../../src/lib/board/shapes/point";
import { PolygonShape } from "../../src/lib/board/shapes/polygon";

test("back-side local coordinates mirror before component rotation", () => {
  const actual = new PointShape([2, 3]).place([10, 20], Math.PI / 2, true);
  expect(Math.abs(actual[0] - 7) < 1e-12).toBeTruthy();
  expect(Math.abs(actual[1] - 18) < 1e-12).toBeTruthy();
});
test("copper triangulation excludes the hole area", () => {
  const m = new PolygonShape([
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    [
      [3, 3],
      [3, 7],
      [7, 7],
      [7, 3],
    ],
  ]).triangulate();
  let area = 0;
  for (let k = 0; k < m.indices.length; k += 3) {
    const [a, b, c] = Array.from(m.indices.slice(k, k + 3)).map((i) => [
      m.points[i * 2],
      m.points[i * 2 + 1],
    ]);
    area +=
      Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) /
      2;
  }
  expect(area).toBe(84);
});
test("full-circle copper boundary is sampled with bounded radial chord error", () => {
  const arc: Segment = {
    id: 1,
    trackId: 1,
    layer: 0,
    net: 0,
    a: [1, 0],
    b: [1, 0],
    width: 0,
    arc: { center: [0, 0], radius: 1, start: 0, sweep: Math.PI * 2 },
  };
  const ring = new PathShape([arc]).flatten(0.001);
  expect(ring.length > 60).toBeTruthy();
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i],
      b = ring[(i + 1) % ring.length];
    expect(
      1 - Math.hypot((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) <= 0.001 + 1e-12,
    ).toBeTruthy();
  }
});
