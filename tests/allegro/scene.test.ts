import { test, expect } from "vitest";

import { allegroUnitScale } from "../../src/lib/allegro/units";

import { ArcShape } from "../../src/lib/board/shapes/arc";
import { Camera } from "../../src/lib/interaction/camera";
test("mils and metric board coordinates resolve to the same physical distance", () => {
  expect(100000 * allegroUnitScale(1, 100)).toBe(25.4);
  expect(254000 * allegroUnitScale(3, 10000)).toBe(25.400000000000002);
});
test("arc sweep chooses the directed crossing over the angle seam", () => {
  const d = Math.PI / 180;
  expect(
    Math.abs(ArcShape.sweep(170 * d, -170 * d, false) - 20 * d) < 1e-12,
  ).toBeTruthy();
  expect(
    Math.abs(ArcShape.sweep(-170 * d, 170 * d, true) + 20 * d) < 1e-12,
  ).toBeTruthy();
});
test("zoom preserves the world point beneath the cursor", () => {
  const c = new Camera();
  c.x = 17;
  c.y = -4;
  c.scale = 50;
  const before = [c.x + (700 - 500) / c.scale, c.y + (400 - 150) / c.scale];
  c.zoom(2.5, 700, 150, 1000, 800);
  expect([
    c.x + (700 - 500) / c.scale,
    c.y + (400 - 150) / c.scale,
  ]).toStrictEqual(before);
});
