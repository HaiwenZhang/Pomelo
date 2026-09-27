import { test, expect } from "vitest";

import { Camera } from "../../src/lib/interaction/camera";

const bounds = { minX: 100, minY: -200, maxX: 140, maxY: -180 };
const close = (a: number[], b: number[]) =>
  a.forEach((v, i) =>
    expect(Math.abs(v - b[i]) < 1e-9, `${a} != ${b}`).toBeTruthy(),
  );
for (const flipped of [false, true]) {
  test(`camera preserves pointer anchor across zoom and clamps, flipped=${flipped}`, () => {
    const camera = new Camera();
    camera.flipped = flipped;
    camera.x = 3;
    camera.y = -7;
    for (const factor of [1.5, 1 / 1.5, 1e20, 1e-30]) {
      const before = camera.worldPoint(173, 401, 800, 600, bounds);
      camera.zoom(factor, 173, 401, 800, 600);
      close(camera.worldPoint(173, 401, 800, 600, bounds), before);
    }
  });
  test(`drag follows the pointer and Fit retains orientation, flipped=${flipped}`, () => {
    const camera = new Camera();
    camera.flipped = flipped;
    camera.fit(bounds, 800, 600);
    const before = camera.worldPoint(230, 340, 800, 600, bounds);
    camera.pan(70, -20);
    close(camera.worldPoint(300, 320, 800, 600, bounds), before);
    camera.fit(bounds, 800, 600);
    expect(camera.flipped).toBe(flipped);
    close(camera.worldPoint(400, 300, 800, 600, bounds), [120, -190]);
  });
}
test("flip reflects around the current view center without changing world coordinates", () => {
  const camera = new Camera();
  camera.x = 12;
  camera.y = 8;
  const left = camera.worldPoint(210, 130, 800, 600, bounds);
  camera.flipped = true;
  close(camera.worldPoint(590, 130, 800, 600, bounds), left);
  expect(camera.x).toBe(12);
  expect(camera.y).toBe(8);
});

for (const flipped of [false, true]) {
  test(`Fit keeps the whole board inside the unobscured workspace, flipped=${flipped}`, () => {
    const camera = new Camera();
    camera.flipped = flipped;
    camera.fit(bounds, 1440, 900, {
      left: 300,
      right: 340,
      top: 80,
      bottom: 110,
    });
    // Available center: (700, 435), independent of the asymmetric floating panels.
    close(camera.worldPoint(700, 435, 1440, 900, bounds), [120, -190]);
    expect(camera.scale * 40).toBeLessThanOrEqual(800);
    expect(camera.scale * 20).toBeLessThanOrEqual(710);
    expect(camera.scale).toBeGreaterThan(0);
  });
}
