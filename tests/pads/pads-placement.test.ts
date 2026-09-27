import { test, expect } from "vitest";

import { padsPlacePoint } from "../../src/lib/pads/scene/placement";
test("PADS bottom reflection happens after local rotation", () => {
  const placement = {
    at: [10, 20] as [number, number],
    angle: Math.PI / 2,
    bottom: false,
  };
  expect(padsPlacePoint([2, 3], placement)).toStrictEqual([7, 22]);
  expect(padsPlacePoint([2, 3], { ...placement, bottom: true })).toStrictEqual([
    13, 22,
  ]);
});
test("PADS oblique placement preserves distance and bottom-side reflection about the origin", () => {
  const placement = {
      at: [10, -7] as [number, number],
      angle: 0.37,
      bottom: false,
    },
    a = padsPlacePoint([4, 2], placement),
    b = padsPlacePoint([4, 2], { ...placement, bottom: true });
  expect(Math.abs(a[0] + b[0] - 20) < 1e-12).toBeTruthy();
  expect(a[1]).toBe(b[1]);
  expect(
    Math.abs(Math.hypot(a[0] - 10, a[1] + 7) - Math.sqrt(20)) < 1e-12,
  ).toBeTruthy();
});
