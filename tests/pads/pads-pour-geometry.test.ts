import { test, expect } from "vitest";

import { padsPourGeometry } from "../../src/lib/pads/copper/pour-geometry";
type Piece = Parameters<typeof padsPourGeometry>[0];
const piece = (type: number, points: Piece["points"]): Piece => ({
  owner: 3,
  index: 8,
  type,
  width: 0.4,
  arcs: [],
  points,
});
test("PADS circles retain analytic semicircles and thermal segment pairs do not acquire connecting edges", () => {
  const circle = padsPourGeometry(
    piece(51, [
      [2, 0],
      [-2, 0],
    ]),
    4,
    9,
  );
  expect(circle.path.length).toBe(2);
  expect(circle.path[0].arc?.radius).toBe(2);
  const strokes = padsPourGeometry(
    piece(52, [
      [0, 0],
      [1, 0],
      [3, 0],
      [4, 0],
    ]),
    4,
    9,
  );
  expect(strokes.kind).toBe("strokes");
  expect(strokes.path.length).toBe(2);
  expect(strokes.path[1].width).toBe(0.4);
  expect(strokes.path[1].net).toBe(9);
});
test("PADS analytic contour uses exact endpoints and preserves a clockwise major arc", () => {
  const p = piece(50, [
    [1, 0],
    [0, 1],
    [1, 0],
  ]);
  p.arcs = [
    {
      sourceIndex: 0,
      vertexIndex: 0,
      center: [0, 0],
      beginTenths: 0,
      sweepTenths: -2700,
    },
  ];
  const r = padsPourGeometry(p, 0, 0);
  expect(r.path[0].arc?.sweep).toBe(-Math.PI * 1.5);
  expect(r.path[0].b).toStrictEqual([0, 1]);
  expect(() =>
    padsPourGeometry(
      piece(53, [
        [0, 0],
        [1, 1],
      ]),
      0,
      0,
    ),
  ).toThrow(/尚待核验/);
});
test("PADS zero quantized sweep retains a small signed arc from exact endpoints", () => {
  const angle = -0.0005,
    p = piece(50, [
      [1, 0],
      [Math.cos(angle), Math.sin(angle)],
      [1, 0],
    ]);
  p.arcs = [
    {
      sourceIndex: 0,
      vertexIndex: 0,
      center: [0, 0],
      beginTenths: 0,
      sweepTenths: 0,
    },
  ];
  expect(
    Math.abs(padsPourGeometry(p, 0, 0).path[0].arc!.sweep - angle) < 1e-12,
  ).toBeTruthy();
});
