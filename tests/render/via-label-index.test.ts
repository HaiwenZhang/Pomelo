import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene, Via } from "../../src/lib/board/model";

import { Camera } from "../../src/lib/interaction/camera";
import {
  BoardLabelLayout,
  type FontAtlas,
} from "../../src/lib/render/board-label-layout";
import { ViaLabelIndex } from "../../src/lib/render/via-label-index";

function via(id: number, x: number, y: number, width = 0.5): Via {
  return {
    id,
    at: [x, y],
    net: (id % 3) + 1,
    padstack: 1,
    drill: 0.2,
    startLayer: 0,
    endLayer: 7,
    pads: [{ layer: 0, type: 2, width, height: width, offset: [0, 0] }],
  };
}
const glyph = {
  uv: [0, 0, 1, 1],
  plane: [-0.2, -0.15, 0.8, 0.8],
  advance: 0.6,
};
const font: FontAtlas = {
  size: 128,
  range: 16,
  glyphs: Object.fromEntries(
    [..."GNDVCCLONG12345678:B- ?"].map((c) => [c, glyph]),
  ),
};
function scene(vias: Via[]): BoardScene {
  return {
    vias,
    layers: Array.from({ length: 8 }, (_, id) => ({
      id,
      name: String(id),
      color: "#fff",
    })),
    nets: new Map([
      [1, "GND"],
      [2, "VCC"],
      [3, "LONG"],
    ]),
    segments: [],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: -60, maxX: 60, minY: -60, maxY: 60 },
  };
}

test("indexed via labels equal the full scan across zoom, span, hidden layers and mirror", () => {
  const vias = Array.from({ length: 10000 }, (_, i) =>
    via(i, ((i * 37) % 100) - 50, ((i * 61) % 101) - 50, 0.1 + (i % 9) / 10),
  );
  // Coincident, buried and backdrilled objects must retain their source order.
  vias.push(via(10001, 0, 0), {
    ...via(10002, 0, 0),
    startLayer: 2,
    endLayer: 5,
    pads: [{ layer: 3, type: 2, width: 1, height: 1, offset: [0, 0] }],
  });
  vias.push({
    ...via(10003, 0.5, 0, 5),
    backdrill: {
      spans: [{ startLayer: 0, stopLayer: 1, protectedLayer: 2 }],
      displayDiameter: 0.4,
      startPadDiameter: 0.5,
      labelDiameter: 0.5,
      sourceReference: 10,
      rotationDegrees: 0,
      mirrored: false,
    },
  });
  const s = scene(vias),
    index = new ViaLabelIndex(vias),
    base = {
      ...BoardDisplay.createDisplayOptions(),
      viaNames: true,
      thruLabels: true,
      bbLabels: true,
    };
  for (const scale of [1, 22, 44, 100, 1000, 1e7])
    for (const [x, y] of [
      [0, 0],
      [49, 50],
      [-52, -51],
    ])
      for (const flipped of [false, true]) {
        const c = new Camera();
        Object.assign(c, { scale, x, y, flipped });
        for (const options of [
          base,
          { ...base, viaNames: false },
          BoardDisplay.setLayerVisibility(base, 0, "via", false),
          { ...base, vias: false },
          { ...base, bbLabels: false, thruLabels: false },
        ])
          expect(
            BoardLabelLayout.layout({
              scene: s,
              font,
              camera: c,
              width: 800,
              height: 600,
              options,
              viaIndex: index,
            }),
          ).toStrictEqual(
            BoardLabelLayout.layout({
              scene: s,
              font,
              camera: c,
              width: 800,
              height: 600,
              options,
            }),
          );
      }
});

test("via label query includes oversized rows at viewport edges and prunes small/offscreen nodes", () => {
  const values = Array.from({ length: 65536 }, (_, i) =>
    via(i, i % 256, Math.floor(i / 256), 0.5),
  );
  const edge = via(70000, -0.49, 0, 1);
  values.push(edge);
  const index = new ViaLabelIndex(values),
    view = { minX: 0, maxX: 0.1, minY: 0, maxY: 0.1 };
  expect(index.query(view, 100, 22).includes(edge)).toBeTruthy();
  expect(index.lastExamined < 1024).toBeTruthy();
  expect(index.query(view, 1, 22)).toStrictEqual([]);
  expect(index.lastExamined).toBe(0);
  expect(
    index.query({ minX: 1000, maxX: 1001, minY: 1000, maxY: 1001 }, 100, 22),
  ).toStrictEqual([]);
  expect(index.lastExamined).toBe(0);
  const all = index.query(
    { minX: -100, maxX: 500, minY: -100, maxY: 500 },
    100,
    22,
  );
  expect(all).toBe(values);
  expect(
    ViaLabelIndex.labelDiameter({
      ...edge,
      backdrill: {
        spans: [{ startLayer: 0, stopLayer: 1, protectedLayer: 2 }],
        displayDiameter: 5,
        startPadDiameter: edge.drill,
        labelDiameter: edge.drill,
        sourceReference: 1,
        rotationDegrees: 0,
        mirrored: false,
      },
    }),
  ).toBe(edge.drill);
});

test("via label index construction can cancel and restart on the main thread", async () => {
  const values = Array.from({ length: 100000 }, (_, i) =>
    via(i, i % 1000, Math.floor(i / 1000)),
  );
  const cancelled = new AbortController();
  cancelled.abort();
  await expect(
    ViaLabelIndex.create(values, cancelled.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
  const controller = new AbortController();
  const pending = ViaLabelIndex.create(values, controller.signal);
  setTimeout(() => controller.abort(), 0);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const restored = await ViaLabelIndex.create(values.slice(0, 128));
  expect(
    restored.query({ minX: -1, maxX: 130, minY: -1, maxY: 1 }, 100, 22)
      .length === 128,
  ).toBeTruthy();
});
