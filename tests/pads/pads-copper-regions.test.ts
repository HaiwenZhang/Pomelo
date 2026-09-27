import { test, expect } from "vitest";
import type { Point } from "../../src/lib/board/model";

import {
  buildPadsCopperRegions,
  orientPadsOffsetRings,
} from "../../src/lib/pads/copper/copper-regions";
import { areaD } from "clipper2-ts";
import type {
  PadsCopperContour,
  PadsCopperFill,
} from "../../src/lib/pads/copper/copper";

const contour = (
  piece: number,
  vertices: Point[],
  width = 0,
): PadsCopperContour => ({
  piece,
  width,
  path: vertices.map((a, i) => ({
    id: piece,
    trackId: piece,
    layer: 0,
    net: 1,
    a,
    b: vertices[(i + 1) % vertices.length],
    width: 0,
  })),
});
const fill = (holes: PadsCopperContour[]): PadsCopperFill => ({
  owner: 1,
  boundary: 0,
  layer: 0,
  net: 0,
  outer: contour(
    1,
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    0.2,
  ),
  holes,
  thermals: [],
  zeroWidthThermalMarkers: [],
  unresolvedThermalPieces: [],
});
test("PADS copper topology unions overlapping voids, clips outside voids and keeps the island", () => {
  const source = fill([
    contour(
      2,
      [
        [2, 2],
        [5, 2],
        [5, 5],
        [2, 5],
      ],
      0.2,
    ),
    contour(
      3,
      [
        [7, 5],
        [4, 5],
        [4, 2],
        [7, 2],
      ],
      0.2,
    ),
    contour(
      4,
      [
        [11, 11],
        [12, 11],
        [12, 12],
        [11, 12],
      ],
      0.2,
    ),
  ]);
  const regions = buildPadsCopperRegions(source);
  expect(regions.length).toBe(1);
  expect(regions[0].holes.length).toBe(1);
  expect(regions[0].outer.some(([x]) => x < 0)).toBeTruthy();
  expect(source.outer.path[0].a).toStrictEqual([0, 0]);
});
test("PADS copper topology honors pre-abort", () => {
  const controller = new AbortController();
  controller.abort();
  expect(() => buildPadsCopperRegions(fill([]), controller.signal)).toThrow();
});
test("PADS offset orientation keeps an inner ring negative even when source winding is reversed", () => {
  const outer: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    inner: Point[] = [
      [2, 2],
      [2, 4],
      [4, 4],
      [4, 2],
    ];
  for (const source of [
    [outer, inner],
    [outer.toReversed(), inner.toReversed()],
  ]) {
    const rings = orientPadsOffsetRings(source);
    expect(areaD(rings[0]) > 0).toBeTruthy();
    expect(areaD(rings[1]) < 0).toBeTruthy();
  }
});
test("PADS finite-width thermal stroke bridges a cutout and splits its void", () => {
  const source = fill([
    contour(2, [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ]),
  ]);
  expect(buildPadsCopperRegions(source)[0].holes.length).toBe(1);
  source.thermals = [
    { id: 3, trackId: 3, layer: 0, net: 1, a: [3, 5], b: [7, 5], width: 0.4 },
  ];
  const regions = buildPadsCopperRegions(source);
  expect(regions.length).toBe(1);
  expect(regions[0].holes.length).toBe(2);
});
test("PADS copper regions reject unresolved thermal geometry", () => {
  const source = fill([]);
  source.unresolvedThermalPieces = [12];
  expect(() => buildPadsCopperRegions(source)).toThrow(/未解析几何/);
});
