import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene } from "../../src/lib/board/model";
import { BoardIndex } from "../../src/lib/interaction/picking";

function scene(count: number): BoardScene {
  return {
    layers: [{ id: 0, name: "TOP", color: "#ffffff" }],
    nets: new Map(),
    segments: Array.from({ length: count }, (_, id) => ({
      id,
      trackId: id,
      layer: 0,
      net: 1,
      a: [(id % 100) * 10, Math.floor(id / 100) * 10],
      b: [(id % 100) * 10 + 2, Math.floor(id / 100) * 10],
      width: 1,
    })),
    vias: [],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
    diagnostics: [],
  };
}
test("cooperative median index preserves exact hits with repeated axis coordinates", async () => {
  const data = scene(10000),
    index = await BoardIndex.create(data),
    display = BoardDisplay.createDisplayOptions();
  for (const i of [0, 99, 100, 321, 4000, 9999]) {
    const hit = index.pick(
      [data.segments[i].a[0] + 1, data.segments[i].a[1]],
      10,
      display,
    );
    expect(hit?.object.value.id).toBe(i);
    expect(index.lastCandidateCount < 20).toBeTruthy();
  }
});
test("index construction yields to cancellation and a subsequent build succeeds", async () => {
  const controller = new AbortController(),
    data = scene(100000);
  const timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(
      BoardIndex.create(data, controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  } finally {
    clearTimeout(timer);
  }
  expect((await BoardIndex.create(scene(100))).objects.length).toBe(100);
});
