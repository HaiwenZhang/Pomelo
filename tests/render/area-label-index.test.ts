import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene, Pin, Zone } from "../../src/lib/board/model";

import { Camera } from "../../src/lib/interaction/camera";
import { AreaLabelIndex } from "../../src/lib/render/area-label-index";
import {
  BoardLabelLayout,
  type FontAtlas,
} from "../../src/lib/render/board-label-layout";

const glyph = {
  uv: [0, 0, 1, 1],
  plane: [-0.15, -0.15, 0.85, 0.8],
  advance: 0.6,
};
const font: FontAtlas = {
  size: 128,
  range: 16,
  glyphs: Object.fromEntries(
    [..."GNDVCCLONG12345678:B- ?"].map((c) => [c, glyph]),
  ),
};
function scene(n = 10000): BoardScene {
  const pins = Array.from(
    { length: n },
    (_, i) =>
      ({
        id: i,
        net: i % 4,
        at: [(i % 100) * 3, Math.floor(i / 100) * 3],
        angle: ((i % 7) * Math.PI) / 6,
        shapes: Array.from({ length: i % 4 }, (_, layer) => ({
          layer,
          type: 6,
          width: 0.1 + (i % 5) * 0.2,
          height: 0.2 + (i % 3) * 0.2,
          offset: [layer * 0.3, layer * 0.2],
        })),
      }) as Pin,
  );
  const zones = Array.from({ length: n }, (_, i) => {
    const x = (i % 100) * 3,
      y = Math.floor(i / 100) * 3,
      w = 0.1 + (i % 8);
    return {
      id: i,
      net: i % 4,
      layer: i % 4,
      paths: [],
      rings: [
        [
          [x, y],
          [x + w, y],
          [x + w, y + w],
          [x, y + w],
        ],
      ],
    } as unknown as Zone;
  });
  return {
    pins,
    zones,
    segments: [],
    vias: [],
    layers: Array.from({ length: 4 }, (_, id) => ({
      id,
      name: String(id),
      color: "#fff",
    })),
    nets: new Map([
      [1, "GND"],
      [2, "VCC"],
      [3, "LONG LONG LONG"],
    ]),
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: 0, maxX: 300, minY: 0, maxY: 300 },
  };
}
test("pin/zone candidates preserve all glyphs, batch order, layers, offsets and flip", () => {
  const s = scene(),
    index = new AreaLabelIndex(s, font),
    base = BoardDisplay.createDisplayOptions();
  for (const scale of [1, 8 / 0.65, 50, 200, 1e4, 1e6])
    for (const [x, y] of [
      [0, 0],
      [-149, -149],
      [150, 150],
      [-170, -170],
    ])
      for (const flipped of [false, true]) {
        const c = new Camera();
        Object.assign(c, { scale, x, y, flipped });
        for (const options of [
          base,
          BoardDisplay.setLayerVisibility(base, 1, "pin", false),
          { ...base, pinNames: false },
          { ...base, shapes: 0 },
        ])
          expect(
            BoardLabelLayout.layout({
              scene: s,
              font,
              camera: c,
              width: 800,
              height: 600,
              options,
              areaIndex: index,
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
test("size and spatial pruning avoid full traversal; dense candidates preserve source array", () => {
  const s = scene(65536),
    index = new AreaLabelIndex(s, font);
  expect(
    index.queryPins({ minX: -10, minY: -10, maxX: 1e4, maxY: 1e4 }, 0.001),
  ).toStrictEqual([]);
  expect(
    index.queryZones({ minX: -10, minY: -10, maxX: 1e4, maxY: 1e4 }, 0.001),
  ).toStrictEqual([]);
  expect(index.lastExamined).toStrictEqual({ pins: 0, zones: 0 });
  index.queryPins({ minX: 4, minY: 4, maxX: 5, maxY: 5 }, 1e6);
  index.queryZones({ minX: 4, minY: 4, maxX: 5, maxY: 5 }, 1e6);
  expect(index.lastExamined.pins < 1024).toBeTruthy();
  expect(index.lastExamined.zones < 1024).toBeTruthy();
  expect(
    index.queryZones({ minX: -10, minY: -10, maxX: 1e4, maxY: 1e4 }, 1e6),
  ).toBe(s.zones);
});
test("area index construction yields, cancels, and can restart without source reordering", async () => {
  const s = scene(100000),
    controller = new AbortController();
  const pending = AreaLabelIndex.create(s, font, controller.signal);
  setTimeout(() => controller.abort(), 0);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(s.pins.every((p, i) => p.id === i)).toBeTruthy();
  const index = await AreaLabelIndex.create(scene(100), font);
  expect(
    index.queryPins({ minX: 0, minY: 0, maxX: 300, maxY: 300 }, 1000).length,
  ).toBeTruthy();
});
