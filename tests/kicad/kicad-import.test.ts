import { test, expect } from "vitest";

import { kiCadArcThrough } from "../../src/lib/kicad/scene/arc";

test("KiCad three-point arcs retain curved, degenerate, and full-circle geometry", () => {
  const quarter = kiCadArcThrough([1, 0], [Math.SQRT1_2, Math.SQRT1_2], [0, 1]);
  expect(quarter).toBeDefined();
  expect(Math.abs(quarter!.radius - 1) < 1e-10).toBeTruthy();
  expect(Math.abs(quarter!.sweep - Math.PI / 2) < 1e-10).toBeTruthy();
  expect(kiCadArcThrough([0, 0], [0.5, 0], [1, 0])).toBeUndefined();
  const circle = kiCadArcThrough([1, 0], [-1, 0], [1, 0]);
  expect(circle).toBeDefined();
  expect(circle!.sweep).toBe(Math.PI * 2);
  expect(circle!.radius).toBe(1);
});
