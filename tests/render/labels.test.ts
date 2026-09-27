import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene, Segment, Zone } from "../../src/lib/board/model";

import { Camera } from "../../src/lib/interaction/camera";
import {
  type FontAtlas,
  type LabelOptions,
} from "../../src/lib/render/board-label-layout";
import { FontMetrics } from "../../src/lib/render/font-metrics";
import { BoardLabelLayout } from "../../src/lib/render/board-label-layout";

const glyph = { uv: [0, 0, 1, 1], plane: [0, 0, 0.6, 1], advance: 0.6 };
const font: FontAtlas = {
  size: 128,
  range: 16,
  glyphs: Object.fromEntries([..."?GND1:8 "].map((c) => [c, glyph])),
};
const options: LabelOptions = {
  trackNames: true,
  pinNames: true,
  viaNames: false,
  thruLabels: true,
  bbLabels: true,
  zoneNames: true,
  shapes: 1,
};
function scene(): BoardScene {
  return {
    layers: Array.from({ length: 8 }, (_, id) => ({
      id,
      name: String(id + 1),
      color: "#ffffff",
    })),
    nets: new Map([[1, "GND"]]),
    segments: [],
    vias: [],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    diagnostics: [],
  };
}
function segment(
  width = 0.2,
  a: [number, number] = [-5, 0],
  b: [number, number] = [5, 0],
): Segment {
  return { id: 1, trackId: 1, layer: 0, net: 1, a, b, width };
}
function camera(scale: number) {
  const c = new Camera();
  c.scale = scale;
  return c;
}
function layout(s: BoardScene, c: Camera, o: LabelOptions = options) {
  return BoardLabelLayout.layout({
    scene: s,
    font,
    camera: c,
    width: 800,
    height: 600,
    options: o,
  });
}

test("mixed capital and descender glyphs center on their visible bounds", () => {
  const mixed: FontAtlas = {
    size: 42,
    range: 4,
    glyphs: {
      A: { uv: [0, 0, 0.1, 0.1], plane: [0, -0.1, 0.6, 0.8], advance: 0.6 },
      g: { uv: [0.1, 0, 0.2, 0.1], plane: [0, -0.3, 0.6, 0.6], advance: 0.6 },
    },
  };
  const target: number[] = [];
  BoardLabelLayout.appendGlyphs({
    target,
    font: mixed,
    text: "Ag",
    center: [10, 20],
    height: 2,
    angle: 0,
    color: [1, 1, 1, 1],
  });
  const bottom = Math.min(target[1], target[17]);
  const top = Math.max(target[1] + target[3], target[17] + target[19]);
  expect((bottom + top) / 2).toBeCloseTo(20, 12);
});

test("line labels depend on projected width and available length, in both zoom directions", () => {
  const s = scene();
  s.segments = [segment()];
  expect(layout(s, camera(55)).has("etch:0")).toBe(false); // 11 px
  expect(layout(s, camera(110)).get("etch:0")!.length > 0).toBeTruthy(); // 22 px
  expect(layout(s, camera(55)).has("etch:0")).toBe(false);
  s.segments = [segment(0.4)];
  expect(layout(s, camera(55)).has("etch:0")).toBeTruthy();
  s.segments = [segment(0.2, [0, 0], [0.02, 0])];
  expect(layout(s, camera(110)).has("etch:0")).toBe(false);
});

test("long segments at maximum zoom enumerate only viewport candidates", () => {
  const s = scene();
  s.segments = [segment(0.2, [-500_000, 0], [500_000, 0])];
  const c = camera(1e7);
  c.x = 0.3; // center near a repeated label, not its now-enlarged gap
  const data = layout(s, c).get("etch:0")!;
  expect(data.length > 0).toBeTruthy();
  expect(data.length / 16 < 100).toBeTruthy();
});

test("deep track glyphs grow with geometry, while short segments retain length fitting", () => {
  const s = scene();
  s.nets.set(1, "LDO12_1R8");
  // PA14611 source dimensions: the observed short vertical run and a long run.
  const short = segment(0.2, [0, -0.4381 / 2], [0, 0.4381 / 2]),
    long = segment(0.2, [-2, 0], [2, 0]);
  const sizes: number[] = [];
  for (const value of [short, long]) {
    s.segments = [value];
    let previous = 0;
    const c = camera(640),
      initial = layout(s, c);
    for (const scale of [640, 1280, 2560, 5120]) {
      c.zoom(scale / c.scale, 400, 300, 800, 600);
      const data = layout(s, c).get("etch:0")!;
      const pixels = data[3] * scale;
      if (previous) expect(Math.abs(pixels / previous - 2) < 1e-9).toBeTruthy();
      previous = pixels;
      expect(data.length / 16 < 100).toBeTruthy(); // clipping bounds allocation even when glyphs exceed viewport
    }
    expect(previous > 64).toBeTruthy();
    sizes.push(previous);
    c.zoom(1 / 8, 400, 300, 800, 600);
    expect(layout(s, c)).toStrictEqual(initial);
  }
  expect(sizes[0] < sizes[1] * 0.65).toBeTruthy();
});

test("visible interval clips reversed, vertical and entirely offscreen segments", () => {
  const bounds = { minX: -1, minY: -1, maxX: 1, maxY: 1 };
  expect(
    BoardLabelLayout.visibleSegmentInterval([-10, 0], [10, 0], bounds),
  ).toStrictEqual([0.45, 0.55]);
  expect(
    BoardLabelLayout.visibleSegmentInterval([0, 10], [0, -10], bounds),
  ).toStrictEqual([0.45, 0.55]);
  expect(
    BoardLabelLayout.visibleSegmentInterval([2, -10], [2, 10], bounds),
  ).toBe(null);
  expect(BoardLabelLayout.visibleSegmentInterval([2, 0], [3, 0], bounds)).toBe(
    null,
  );
});

test("reversed and vertical track text stays readable", () => {
  const s = scene();
  s.segments = [segment(0.4, [5, 0], [-5, 0])];
  let data = layout(s, camera(100)).get("etch:0")!;
  expect(Math.abs(data[12] - 1) < 1e-12).toBeTruthy();
  expect(Math.abs(data[13]) < 1e-12).toBeTruthy();
  s.segments = [segment(0.4, [0, -5], [0, 5])];
  data = layout(s, camera(100)).get("etch:0")!;
  expect(Math.abs(data[12]) < 1e-12).toBeTruthy();
  expect(Math.abs(data[13] - 1) < 1e-12).toBeTruthy();
});

test("through-hole labels need a visible Via layer but not an enabled drill center", () => {
  const s = scene();
  s.vias = [
    {
      id: 1,
      net: 1,
      at: [0, 0],
      padstack: 1,
      drill: 0.2,
      startLayer: 0,
      endLayer: 7,
      pads: [{ layer: 0, type: 2, width: 0.5, height: 0.5, offset: [0, 0] }],
    },
  ];
  const hidden = new Set(s.layers.map((l) => l.id));
  expect(layout(s, camera(100), { ...options, hidden }).has("drill")).toBe(
    false,
  );
  expect(layout(s, camera(100), { ...options, vias: false }).has("drill")).toBe(
    false,
  );
  expect(
    layout(s, camera(100), { ...options, drills: false }).get("drill"),
  ).toStrictEqual(layout(s, camera(100)).get("drill"));
  expect(
    layout(s, camera(100), { ...options, thruLabels: false }).has("drill"),
  ).toBe(false);
  s.vias[0].startLayer = 2;
  expect(
    layout(s, camera(100), { ...options, bbLabels: false }).has("drill"),
  ).toBe(false);
});

test("via span and net name use separate rows, and either alone returns to center", () => {
  const s = scene(),
    c = camera(200);
  s.vias = [
    {
      id: 1,
      net: 1,
      at: [0, 0],
      padstack: 1,
      drill: 0.2,
      startLayer: 0,
      endLayer: 7,
      pads: [{ layer: 0, type: 2, width: 1, height: 1, offset: [0, 0] }],
    },
  ];
  const span = layout(s, c, { ...options, viaNames: false }).get("drill")!;
  const name = layout(s, c, {
    ...options,
    viaNames: true,
    thruLabels: false,
  }).get("drill")!;
  const both = layout(s, c, { ...options, viaNames: true }).get("drill")!;
  expect(both.length).toBe(span.length + name.length);
  for (let i = 0; i < span.length; i += 16) {
    expect(both[i + 1] > span[i + 1]).toBeTruthy();
    expect(both[i + 3]).toBe(span[i + 3]);
  }
  for (let i = 0; i < name.length; i += 16) {
    expect(both[span.length + i + 1] < name[i + 1]).toBeTruthy();
    expect(both[span.length + i + 3]).toBe(name[i + 3]);
  }
  expect(
    layout(s, c, {
      ...options,
      viaNames: true,
      vias: false,
      drills: false,
      hidden: new Set(s.layers.map((l) => l.id)),
    }).has("drill"),
  ).toBe(false);
  c.flipped = true;
  const flip = layout(s, c, { ...options, viaNames: true }).get("drill")!;
  for (let i = 0; i < both.length; i += 16)
    expect(flip[i + 1]).toBe(both[i + 1]);
  s.nets.set(1, "GND".repeat(100));
  expect(
    layout(s, c, { ...options, viaNames: true }).get("drill"),
  ).toStrictEqual(layout(s, c, { ...options, viaNames: false }).get("drill"));
});

test("copper labels hold their screen layout above the size cap and honor independent controls", () => {
  const s = scene();
  const zone: Zone = {
    id: 9,
    net: 1,
    layer: 0,
    rings: [
      [
        [-100, -100],
        [100, -100],
        [100, 100],
        [-100, 100],
      ],
    ],
    paths: [],
    points: new Float64Array(),
    indices: new Uint32Array(),
  };
  s.zones = [zone];
  const first = camera(20),
    second = camera(40);
  second.x = 2;
  second.y = -3;
  const a = layout(s, first).get("zone:9")!,
    b = layout(s, second).get("zone:9")!;
  expect(a.length).toBe(b.length);
  expect(a.length / 16).toBe(3 * 3); // three GND labels, no dense tile grid
  for (let i = 0; i < a.length; i += 16) {
    expect(
      Math.abs(
        (a[i] - first.x) * first.scale - (b[i] - second.x) * second.scale,
      ) < 1e-8,
    ).toBeTruthy();
    expect(
      Math.abs(
        (a[i + 1] - first.y) * first.scale -
          (b[i + 1] - second.y) * second.scale,
      ) < 1e-8,
    ).toBeTruthy();
    expect(
      Math.abs(a[i + 3] * first.scale - b[i + 3] * second.scale) < 1e-8,
    ).toBeTruthy();
  }
  for (const override of [
    { zoneNames: false },
    { shapes: 0 },
    { hidden: new Set([0]) },
  ])
    expect(layout(s, first, { ...options, ...override }).has("zone:9")).toBe(
      false,
    );
});

test("large copper labels keep three anchors across viewport sizes and extreme zoom", () => {
  const s = scene();
  s.zones = [
    {
      id: 9,
      net: 1,
      layer: 0,
      rings: [
        [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100],
        ],
      ],
      paths: [],
      points: new Float64Array(),
      indices: new Uint32Array(),
    },
  ];
  for (const [width, height] of [
    [800, 600],
    [1920, 1080],
    [3840, 2160],
  ])
    for (const scale of [100, 1e7]) {
      const c = camera(scale),
        data = BoardLabelLayout.layout({
          scene: s,
          font,
          camera: c,
          width,
          height,
          options,
        }).get("zone:9")!;
      expect(data.length / 16).toBe(9);
      for (let label = 0; label < 3; label++) {
        const i = label * 3 * 16,
          size = data[i + 2] / glyph.plane[2],
          center = data[i] + (FontMetrics.advance(font, "GND") * size) / 2;
        expect(
          Math.abs(center * scale + width / 2 - (width * (label + 1)) / 4) <
            1e-6,
        ).toBeTruthy();
      }
    }
  const c = camera(100),
    short = layout(s, c).get("zone:9")!;
  s.nets.set(1, "GND".repeat(4));
  const long = layout(s, c).get("zone:9")!;
  expect(long[3] < short[3]).toBeTruthy(); // long names fit the available screen width
});

test("copper text follows visible width at fixed zoom and hides when rows no longer fit", () => {
  const s = scene();
  s.zones = [
    {
      id: 9,
      net: 1,
      layer: 0,
      rings: [
        [
          [-4, -4],
          [4, -4],
          [4, 4],
          [-4, 4],
        ],
      ],
      paths: [],
      points: new Float64Array(),
      indices: new Uint32Array(),
    },
  ];
  const c = camera(100),
    initial = layout(s, c).get("zone:9")!;
  c.x = 4;
  const half = layout(s, c).get("zone:9")!;
  expect(half.length).toBe(initial.length);
  expect(Math.abs(half[2] / initial[2] - 0.5) < 1e-12).toBeTruthy();
  expect(Math.abs(half[3] / initial[3] - 0.5) < 1e-12).toBeTruthy();
  c.y = 5;
  expect(layout(s, c).has("zone:9")).toBeTruthy(); // 200 px / 4 fits the ~44 px nominal line
  c.y = 5.5;
  expect(layout(s, c).has("zone:9")).toBe(false);
  c.x = 0;
  c.y = 0;
  expect(layout(s, c).get("zone:9")).toStrictEqual(initial);
  c.x = 8;
  expect(layout(s, c).has("zone:9")).toBe(false); // edge contact has no visible width
});

test("hidden layers and pins do not allocate label batches", () => {
  const s = scene();
  s.segments = [segment(0.4)];
  s.pins = [
    {
      id: 2,
      net: 1,
      name: "1",
      reference: "U1",
      at: [0, 0],
      angle: 0,
      back: false,
      drill: 0,
      shapes: [
        { layer: 0, type: 6, width: 2, height: 1, offset: [0, 0], corner: 0 },
      ],
    },
  ];
  expect(layout(s, camera(100)).has("pin:0")).toBeTruthy();
  expect(layout(s, camera(100), { ...options, pins: false }).has("pin:0")).toBe(
    false,
  );
  expect(
    layout(s, camera(100), { ...options, hidden: new Set([0]) }).size,
  ).toBe(0);
});

test("unavailable glyphs use a finite fallback and spaces advance without quads", () => {
  const data: number[] = [];
  BoardLabelLayout.appendGlyphs({
    target: data,
    font,
    text: "G 缺",
    center: [0, 0],
    height: 1,
    angle: 0,
    color: [1, 1, 1, 1],
  });
  expect(data.length / 16).toBe(2);
  expect(data.every(Number.isFinite)).toBeTruthy();
  expect(FontMetrics.advance(font, "缺")).toBe(FontMetrics.advance(font, "?"));
});

test("per-layer Etch and Pin switches suppress only their own label candidates", () => {
  const s = scene();
  s.segments = [segment(0.4), { ...segment(0.4), id: 2, layer: 1 }];
  s.pins = [
    {
      id: 3,
      net: 1,
      name: "1",
      reference: "U1",
      at: [0, 0],
      angle: 0,
      back: false,
      drill: 0,
      shapes: [
        { layer: 0, type: 6, width: 2, height: 1, offset: [0, 0], corner: 0 },
      ],
    },
  ];
  s.zones = [
    {
      id: 9,
      net: 1,
      layer: 0,
      rings: [
        [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100],
        ],
      ],
      paths: [],
      points: new Float64Array(),
      indices: new Uint32Array(),
    },
  ];
  const base = BoardDisplay.createDisplayOptions(),
    c = camera(100),
    before = layout(s, c, base);
  expect(before.has("zone:9")).toBeTruthy();
  expect(before.has("etch:0")).toBeTruthy();
  expect(before.has("pin:0")).toBeTruthy();
  const noEtch = BoardDisplay.setLayerVisibility(base, 0, "etch", false),
    after = layout(s, c, noEtch);
  expect(after.has("etch:0")).toBe(false);
  expect(after.has("zone:9")).toBe(false);
  expect(after.get("etch:1")).toStrictEqual(before.get("etch:1"));
  expect(after.get("pin:0")).toStrictEqual(before.get("pin:0"));
  expect(
    layout(s, c, BoardDisplay.setLayerVisibility(noEtch, 0, "pin", false)).has(
      "pin:0",
    ),
  ).toBe(false);
  expect(
    layout(s, c, BoardDisplay.setLayerVisibility(noEtch, 0, "etch", true)),
  ).toStrictEqual(before);
});

test("flipped automatic text keeps readable glyph axes while copper labels reflect", () => {
  const s = scene(),
    c = camera(100);
  s.segments = [segment(0.4, [-5, -5], [5, 5])];
  s.vias = [
    {
      id: 2,
      net: 1,
      at: [2, 3],
      drill: 0.2,
      padstack: 1,
      startLayer: 0,
      endLayer: 7,
      pads: [{ layer: 0, type: 2, width: 0.5, height: 0.5, offset: [0, 0] }],
    },
  ];
  s.pins = [
    {
      id: 3,
      net: 1,
      name: "A",
      reference: "U1",
      at: [-2, 3],
      angle: Math.PI / 6,
      back: false,
      drill: 0,
      shapes: [{ layer: 0, type: 6, width: 2, height: 1, offset: [0, 0] }],
    },
  ];
  s.zones = [
    {
      id: 9,
      net: 1,
      layer: 0,
      rings: [
        [
          [-100, -100],
          [100, -100],
          [100, 100],
          [-100, 100],
        ],
      ],
      paths: [],
      points: new Float64Array(),
      indices: new Uint32Array(),
    },
  ];
  const normal = layout(s, c);
  c.flipped = true;
  const flipped = layout(s, c);
  for (const key of ["etch:0", "pin:0", "drill"]) {
    const data = flipped.get(key)!;
    expect(data.length > 0).toBeTruthy();
    for (let i = 0; i < data.length; i += 16) {
      const [cos, sin, localSign] = data.slice(i + 12, i + 15);
      // Determinant of screen-space glyph basis: positive means no reflection.
      const determinant =
        c.horizontalSign * localSign * (cos * cos + sin * sin);
      expect(determinant > 0.99).toBeTruthy();
      expect(cos >= 0).toBeTruthy();
    }
  }
  expect(flipped.get("etch:0")![13] < 0).toBeTruthy(); // +45 degree world line now -45 degrees.
  expect(flipped.get("pin:0")![13] < 0).toBeTruthy();
  expect(flipped.get("zone:9")).toStrictEqual(normal.get("zone:9")); // camera reflects entire layout
  expect(flipped.get("zone:9")![14] * c.horizontalSign).toBe(-1);
  c.flipped = false;
  expect(layout(s, c)).toStrictEqual(normal);
});
