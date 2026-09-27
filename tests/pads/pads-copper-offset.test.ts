import { test, expect } from "vitest";
import type { Point } from "../../src/lib/board/model";

import { offsetPadsCopperContour } from "../../src/lib/pads/copper/copper-offset";
import type { PadsCopperContour } from "../../src/lib/pads/copper/copper";

const contour = (points: Point[], width: number): PadsCopperContour => ({
  piece: 1,
  width,
  path: points.map((a, i) => ({
    id: 1,
    trackId: 1,
    layer: 0,
    net: 1,
    a,
    b: points[(i + 1) % points.length],
    width: 0,
  })),
});
const box = (rings: Point[][]) => {
  const all = rings.flat();
  return [
    Math.min(...all.map((p) => p[0])),
    Math.min(...all.map((p) => p[1])),
    Math.max(...all.map((p) => p[0])),
    Math.max(...all.map((p) => p[1])),
  ];
};
const nearBox = (actual: number[], expected: number[]) =>
  actual.forEach((v, i) =>
    expect(
      Math.abs(v - expected[i]) < 0.000002,
      `${i}: ${v} != ${expected[i]}`,
    ).toBeTruthy(),
  );
test("PADS saved stroke expands outer contour and contracts a hole regardless of winding", () => {
  const square: Point[] = [
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ];
  for (const source of [square, [...square].reverse()]) {
    nearBox(
      box(offsetPadsCopperContour(contour(source, 0.2), "outer")),
      [-0.1, -0.1, 2.1, 2.1],
    );
    nearBox(
      box(offsetPadsCopperContour(contour(source, 0.2), "hole")),
      [0.1, 0.1, 1.9, 1.9],
    );
  }
  expect(square).toStrictEqual([
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ]);
});
test("PADS offset rejects open and invalid contours", () => {
  const square = contour(
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
    0.2,
  );
  expect(() =>
    offsetPadsCopperContour(
      { ...square, path: square.path.slice(0, 2) },
      "outer",
    ),
  ).toThrow(/未闭合/);
  expect(() =>
    offsetPadsCopperContour({ ...square, width: -1 }, "outer"),
  ).toThrow(/宽度/);
});
test("tiny collapsed saved void has no cutout while a long two-point path remains unresolved", () => {
  const tiny = contour(
    [
      [0, 0],
      [0.00001, 0],
      [0, 0],
    ],
    0.1,
  );
  expect(offsetPadsCopperContour(tiny, "hole")).toStrictEqual([]);
  expect(() => offsetPadsCopperContour(tiny, "outer")).toThrow(/顶点无效/);
  expect(() =>
    offsetPadsCopperContour(
      contour(
        [
          [0, 0],
          [1, 0],
          [0, 0],
        ],
        0.1,
      ),
      "hole",
    ),
  ).toThrow(/顶点无效/);
});
