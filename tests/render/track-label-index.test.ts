import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene, Segment } from "../../src/lib/board/model";

import { Camera } from "../../src/lib/interaction/camera";
import {
  BoardLabelLayout,
  type FontAtlas,
} from "../../src/lib/render/board-label-layout";
import { TrackLabelIndex } from "../../src/lib/render/track-label-index";

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
function segment(id: number): Segment {
  const x = ((id * 37) % 200) - 100,
    y = ((id * 61) % 201) - 100;
  return {
    id,
    trackId: id,
    net: (id % 3) + 1,
    layer: id % 4,
    width: 0.02 + (id % 10) * 0.1,
    a: [x, y],
    b: [x + (id % 7) * 0.13, y + (id % 5) * 0.2],
  };
}
function scene(segments: Segment[]): BoardScene {
  return {
    segments,
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
    vias: [],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: -120, maxX: 120, minY: -120, maxY: 120 },
  };
}

test("track index preserves every glyph and ordering across width thresholds, clipping and flip", () => {
  const segments = Array.from({ length: 10000 }, (_, i) => segment(i));
  segments.push({
    ...segment(10000),
    a: [-500000, 0],
    b: [500000, 0],
    width: 0.2,
  });
  segments.push({
    ...segment(10001),
    a: [0.4, -0.3],
    b: [-0.4, 0.3],
    width: 1,
  });
  segments.push({ ...segment(10002), a: [0, 0.4381], b: [0, 0], width: 0.2 });
  segments.push({
    ...segment(10003),
    a: [1, 0],
    b: [0, 1],
    arc: { center: [0, 0], radius: 1, start: 0, sweep: Math.PI / 2 },
  });
  const s = scene(segments),
    index = new TrackLabelIndex(segments, s.nets, font),
    base = BoardDisplay.createDisplayOptions();
  for (const scale of [1, 11.999, 12, 60, 200, 10000, 1e7])
    for (const [x, y] of [
      [0, 0],
      [0.3, 0.3],
      [99, 100],
      [-110, -111],
    ])
      for (const flipped of [false, true]) {
        const c = new Camera();
        Object.assign(c, { scale, x, y, flipped });
        for (const options of [
          base,
          BoardDisplay.setLayerVisibility(base, 0, "etch", false),
          { ...base, trackNames: false },
        ])
          expect(
            BoardLabelLayout.layout({
              scene: s,
              font,
              camera: c,
              width: 800,
              height: 600,
              options,
              trackIndex: index,
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

test("track envelopes include labels beside the viewport and prune small or distant segments", () => {
  const segments = Array.from(
    { length: 65536 },
    (_, i) =>
      ({
        ...segment(i),
        a: [i % 256, Math.floor(i / 256)],
        b: [(i % 256) + 0.1, Math.floor(i / 256) + 0.1],
      }) as Segment,
  );
  const s = scene(segments),
    index = new TrackLabelIndex(segments, s.nets, font),
    c = new Camera();
  c.scale = 1e7;
  c.x = 0.05;
  c.y = 0.05;
  expect(
    BoardLabelLayout.layout({
      scene: s,
      font,
      camera: c,
      width: 800,
      height: 600,
      options: BoardDisplay.createDisplayOptions(),
      trackIndex: index,
    }),
  ).toStrictEqual(
    BoardLabelLayout.layout({
      scene: s,
      font,
      camera: c,
      width: 800,
      height: 600,
      options: BoardDisplay.createDisplayOptions(),
    }),
  );
  expect(index.lastExamined < 1024).toBeTruthy();
  expect(
    index.query({ minX: -100, maxX: 500, minY: -100, maxY: 500 }, 1),
  ).toStrictEqual([]);
  expect(index.lastExamined).toBe(0);
  expect(
    index.query({ minX: 1000, maxX: 1001, minY: 1000, maxY: 1001 }, 100),
  ).toStrictEqual([]);
  expect(index.lastExamined).toBe(0);
  expect(
    index.query({ minX: -100, maxX: 500, minY: -100, maxY: 500 }, 1000),
  ).toBe(segments);
  // The original layout retains padded candidates beyond the physical line.
  // A physical-copper-only index would drop these and change glyph batches.
  const long = {
    ...segment(70000),
    net: 3,
    width: 0.2,
    a: [-5, 0],
    b: [5, 0],
  } as Segment;
  const paddedScene = scene([
    ...segments.map(
      (s) =>
        ({
          ...s,
          a: [s.a[0] + 1000, s.a[1] + 1000],
          b: [s.b[0] + 1000, s.b[1] + 1000],
        }) as Segment,
    ),
    long,
  ]);
  const paddedIndex = new TrackLabelIndex(
    paddedScene.segments,
    paddedScene.nets,
    font,
  );
  Object.assign(c, { scale: 10000, x: 5 / 6, y: 0.5 });
  const reference = BoardLabelLayout.layout({
    scene: paddedScene,
    font,
    camera: c,
    width: 800,
    height: 600,
    options: BoardDisplay.createDisplayOptions(),
  });
  expect(reference.size > 0).toBeTruthy();
  expect(
    BoardLabelLayout.layout({
      scene: paddedScene,
      font,
      camera: c,
      width: 800,
      height: 600,
      options: BoardDisplay.createDisplayOptions(),
      trackIndex: paddedIndex,
    }),
  ).toStrictEqual(reference);
});

test("track label construction cancels and restarts without mutating source order", async () => {
  const segments = Array.from({ length: 100000 }, (_, i) => segment(i)),
    s = scene(segments);
  const controller = new AbortController(),
    pending = TrackLabelIndex.create(segments, s.nets, font, controller.signal);
  setTimeout(() => controller.abort(), 0);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(segments.every((s, i) => s.id === i)).toBeTruthy();
  const index = await TrackLabelIndex.create(
    segments.slice(0, 256),
    s.nets,
    font,
  );
  expect(
    index.query({ minX: -500, maxX: 500, minY: -500, maxY: 500 }, 1000).length >
      0,
  ).toBeTruthy();
});
