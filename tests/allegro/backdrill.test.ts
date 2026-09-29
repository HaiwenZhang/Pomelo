import { test, expect } from "vitest";

import type { RawRecord } from "../../src/lib/allegro/binary/record-types";
type Raw = RawRecord & { type: number };
import { AllegroPadstackResolver } from "../../src/lib/allegro/decoders/padstack";
import type { BoardScene, PadShape, Via } from "../../src/lib/board/model";
import { BackdrillShape } from "../../src/lib/board/shapes/backdrill";

import { BoardDisplay } from "../../src/lib/board/display";

import { Camera } from "../../src/lib/interaction/camera";
import { hoverDetails } from "../../src/lib/interaction/hover-details";
import { BoardIndex, selectionScene } from "../../src/lib/interaction/picking";
import {
  BoardLabelLayout,
  type FontAtlas,
} from "../../src/lib/render/board-label-layout";
import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";
import { ViaLabelIndex } from "../../src/lib/render/via-label-index";

// Independent Padstack Editor / Show Element observations, not solder-mask-derived fixtures.
const cases = [
  {
    name: "874",
    version: 180,
    layers: 18,
    encoded: 12,
    drill: 2540,
    ordinary: 5080,
    start: 2540,
    metadata: [
      0,
      0,
      0,
      2540,
      2540,
      2,
      12337,
      4294963232,
      0,
      0,
      2540,
      2540,
      2,
      12337,
      ...Array(15).fill(0),
    ],
    display: 4064,
    label: 2540,
    tag: "B1-12-13",
  },
  {
    name: "874 bottom",
    version: 180,
    layers: 18,
    encoded: 1280,
    drill: 2000,
    ordinary: 4500,
    start: 2000,
    metadata: [
      0,
      0,
      0,
      2000,
      2000,
      2,
      4278082,
      4294963772,
      0,
      0,
      2000,
      2000,
      2,
      4278082,
      ...Array(15).fill(0),
    ],
    display: 3524,
    label: 2000,
    tag: "B18-14-13",
  },
  {
    name: "AGILEX",
    version: 174,
    layers: 22,
    encoded: 3840,
    drill: 600,
    ordinary: 1600,
    start: 1600,
    metadata: [1600, 0, 0, 2000, 2000, 2, 65, ...Array(14).fill(0)],
    display: 1600,
    label: 1600,
    tag: "B22-8-7",
  },
  {
    name: "S5000 dual",
    version: 174,
    layers: 14,
    encoded: 1028,
    drill: 10000,
    ordinary: 18000,
    start: 20000,
    metadata: [4294947296, 0, 0, 10000, 10000, 5, 0, ...Array(14).fill(0)],
    display: 20000,
    label: 18000,
    tag: "B1-4-5,B14-11-10",
  },
];
function records(c = cases[0]) {
  const circle = (
    size: number,
  ): {
    Type: number;
    W?: number;
    H?: number;
    OffsetX?: number;
    OffsetY?: number;
  } => ({
    Type: 2,
    W: size,
    H: size,
    OffsetX: 0,
    OffsetY: 0,
  });
  const components = Array.from({ length: 21 + c.layers * 4 }, () =>
    circle(c.ordinary),
  );
  components[5] = circle(c.start);
  components[14] = circle(7777);
  components[15] = circle(8888);
  const stack = {
    type: 28,
    Key: 51424,
    StartLayer: 0,
    LayerCount: c.layers,
    DrillSize: c.drill,
    SlotX: 0,
    SlotY: 0,
    NumFixedCompEntries: 21,
    NumCompsPerLayer: 4,
    Components: components,
    DrillMetadataWords: [...c.metadata],
  };
  const wrapper = {
    type: 47,
    Type: 0,
    T2: 0,
    UnknownArray: [51424, 93381, c.layers, 2788826, c.encoded, 32],
  };
  const map = new Map<number, Raw>([
      [51424, stack],
      [2383683, wrapper],
    ]),
    get = (key: number) => map.get(key);
  return {
    stack,
    wrapper,
    get,
    resolve: () =>
      new AllegroPadstackResolver(get, c.layers, c.version).resolveVia(
        2383683,
        93381,
      ),
  };
}
for (const c of cases)
  test(`${c.name}: native backdrill dimensions and spans are independent of solder masks`, () => {
    const r = records(c),
      bd = r.resolve()!.backdrill!;
    expect(bd.displayDiameter).toBe(c.display);
    expect(bd.startPadDiameter).toBe(c.start);
    expect(bd.labelDiameter).toBe(c.label);
    expect(new BackdrillShape(bd).label()).toBe(c.tag);
    r.stack.Components[14] = { Type: 0 };
    r.stack.Components[15] = { Type: 0 };
    expect(r.resolve()!.backdrill).toStrictEqual(bd);
    expect(
      new AllegroPadstackResolver(r.get, c.layers, undefined).resolvePin(
        2383683,
        93381,
      ),
    ).toBe(undefined);
  });
test("dual spans preserve TOP then BOTTOM order and reject overlapping/inconsistent wrappers", () => {
  const r = records(cases[3]);
  expect(r.resolve()!.backdrill!.spans).toStrictEqual([
    { startLayer: 0, stopLayer: 3, protectedLayer: 4 },
    { startLayer: 13, stopLayer: 10, protectedLayer: 9 },
  ]);
  for (const encoded of [0, 14, 10 + 4 * 256, 65536, -1]) {
    r.wrapper.UnknownArray[4] = encoded;
    expect(r.resolve()).toBe(undefined);
  }
  r.wrapper.UnknownArray[4] = 1028;
  r.wrapper.UnknownArray[1] = 999;
  expect(r.resolve()).toBe(undefined);
  expect(
    new AllegroPadstackResolver(r.get, 14, 174).resolveVia(51424, 93381),
  ).toStrictEqual({
    stack: r.stack,
  });
});
test("unknown metadata layout and unsupported geometry stay diagnostic", () => {
  const r = records();
  r.stack.DrillMetadataWords = [];
  expect(r.resolve()).toBe(undefined);
  r.stack.DrillMetadataWords = [...cases[0].metadata];
  r.stack.DrillMetadataWords[7] = 0;
  expect(r.resolve()).toBe(undefined);
  r.stack.DrillMetadataWords[7] = 4294963232;
  r.stack.Components[5].Type = 3;
  expect(r.resolve()).toBe(undefined);
  r.stack.Components[5].Type = 2;
  r.stack.Components[23].OffsetX = 1;
  expect(r.resolve()).toBe(undefined);
  r.stack.Components[23].OffsetX = 0;
  expect(
    new AllegroPadstackResolver(r.get, 18, 174).resolveVia(2383683, 93381),
  ).toBe(undefined);
});
test("padstack wrapper rejects non-numeric opaque words", () => {
  const r = records();
  // @ts-expect-error Deliberately malformed decoded word exercises runtime validation.
  r.wrapper.UnknownArray[3] = "opaque";
  expect(r.resolve()).toBe(undefined);
});
function fixture(c = cases[0]) {
  const bd = records(c).resolve()!.backdrill!,
    unit = c.name.startsWith("874")
      ? 0.0001
      : c.name === "AGILEX"
        ? 0.000254
        : 0.0000254;
  const definition = {
    ...bd,
    displayDiameter: bd.displayDiameter * unit,
    startPadDiameter: bd.startPadDiameter * unit,
    labelDiameter: bd.labelDiameter * unit,
  };
  const ordinary: PadShape[] = Array.from({ length: c.layers }, (_, layer) => ({
    layer,
    type: 2,
    width: c.ordinary * unit,
    height: c.ordinary * unit,
    offset: [0, 0],
  }));
  const via: Via = {
    id: 93381,
    net: 1,
    at: [0, 0],
    padstack: 51424,
    drill: c.drill * unit,
    startLayer: 0,
    endLayer: c.layers - 1,
    backdrill: {
      ...definition,
      sourceReference: 2383683,
      rotationDegrees: 180,
      mirrored: false,
    },
    pads: BackdrillShape.applyPads(ordinary, definition),
  };
  const board: BoardScene = {
    layers: Array.from({ length: c.layers }, (_, id) => ({
      id,
      name: `L${id + 1}`,
      color: "#40aacc",
    })),
    nets: new Map([[1, "USB32_P1_TX_DN"]]),
    vias: [via],
    pins: [],
    segments: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
    diagnostics: [],
  };
  const only = (...layers: number[]) => ({
    ...BoardDisplay.createDisplayOptions(),
    hidden: new Set(
      board.layers.filter((l) => !layers.includes(l.id)).map((l) => l.id),
    ),
  });
  return { via, board, only, unit };
}
test("native enhancement-OFF pad diameters: 874 .254/.254, AGILEX 16/16, S5000 20/18 mil", () => {
  for (const c of cases) {
    const { via, unit } = fixture(c),
      bd = via.backdrill!;
    expect(ViaLabelIndex.labelDiameter(via)).toBe(c.label * unit);
    for (const span of bd.spans) {
      expect(
        via.pads.find((p) => p.backdrillBase && p.layer === span.startLayer)!
          .width,
      ).toBe(c.start * unit);
      expect(
        via.pads.find((p) => p.backdrillBase && p.layer === span.stopLayer)!
          .width,
      ).toBe(Math.min(c.start, c.ordinary) * unit);
      expect(via.pads.find((p) => p.layer === span.protectedLayer)!.width).toBe(
        c.ordinary * unit,
      );
    }
    for (const p of via.pads)
      expect(!!p.backdrill || !!p.backdrillBase).toBe(
        new BackdrillShape(bd).containsLayer(p.layer),
      );
  }
});
test("dual enhancement is one overlay for either end, with matching picking and selection", async () => {
  const { board, via, only } = fixture(cases[3]),
    index = new BoardIndex(board),
    batches = new PrimitiveBatchBuilder(board).build(),
    back = batches.filter((b) => b.backdrill);
  expect(back.length).toBe(1);
  expect(back[0].data.length).toBe(12);
  expect(back[0].viaLayers).toStrictEqual([0, 1, 2, 3, 10, 11, 12, 13]);
  for (const layer of [0, 3, 4, 9, 10, 13]) {
    for (const enabled of [true, false]) {
      const display = { ...only(layer), filled: true, backdrills: enabled };
      expect(BoardDisplay.isBatchVisible(display, back[0])).toBe(
        enabled && [0, 3, 10, 13].includes(layer),
      );
      // .245 lies inside a 20 mil pad but outside an 18 mil pad.
      const expected =
        [0, 13].includes(layer) || (enabled && [3, 10].includes(layer));
      expect(
        index.pick([0.245, 0], 1000, display, "via", 0)?.object.value.id,
      ).toBe(expected ? via.id : undefined);
      expect(index.pick([0.27, 0], 1000, display, "via", 0)).toBe(null);
    }
  }
  const hit = index.pick([0.245, 0], 1000, only(0, 13), "via", 0)!;
  expect(
    new PrimitiveBatchBuilder(
      selectionScene(board, index.select(hit, "object").objects),
    )
      .build()
      .filter((b) => b.backdrill).length,
  ).toBe(1);
  const detail = await hoverDetails(
    board,
    index,
    hit,
    "object",
    new AbortController().signal,
  );
  expect(detail.includes("Backdrill: L1 -> L4; protect L5")).toBeTruthy();
  expect(detail.includes("Backdrill: L14 -> L11; protect L10")).toBeTruthy();
});
test("874 enhancement off has no annulus beyond the original hole on start or cut interior layer", () => {
  const { board, via, only } = fixture(),
    index = new BoardIndex(board);
  for (const layer of [0, 11]) {
    const display = { ...only(layer), filled: true, backdrills: false };
    expect(index.pick([0.19, 0], 1000, display, "via", 0)).toBe(null);
    expect(index.pick([0, 0], 1000, display, "via", 0)?.object.value.id).toBe(
      via.id,
    );
    expect(
      index.pick([0.19, 0], 1000, { ...display, backdrills: true }, "via", 0)
        ?.object.value.id,
    ).toBe(via.id);
  }
});
test("complete dual label remains on either end or retained layer, independent of enhancement and through label controls", () => {
  const { board, only } = fixture(cases[3]);
  const chars = [...new Set("?B18-23456790:,USB_TXPDN")];
  const font: FontAtlas = {
    size: 128,
    range: 16,
    glyphs: Object.fromEntries(
      chars.map((c, i) => [
        c,
        {
          uv: [i / 64, 0, (i + 1) / 64, 1],
          plane: [0, 0, 0.6, 1],
          advance: 0.6,
        },
      ]),
    ),
  };
  const camera = new Camera();
  camera.scale = 1000;
  const labels = (options = only(0)) =>
    BoardLabelLayout.layout({
      scene: board,
      font,
      camera,
      width: 800,
      height: 600,
      options,
    }).get("drill") ?? [];
  const decode = (data: number[]) =>
    Array.from(
      { length: data.length / 16 },
      (_, i) => chars[Math.round(data[i * 16 + 4] * 64)],
    ).join("");
  for (const layer of [0, 4, 13])
    expect(
      decode(labels({ ...only(layer), backdrills: false, thruLabels: false })),
    ).toBe("B1-4-5,B14-11-10");
  expect(decode(labels({ ...only(0), bbLabels: false }))).toBe("");
  expect(decode(labels({ ...only(0), vias: false }))).toBe("");
  const initial = labels();
  camera.scale *= 2;
  expect(labels()).toStrictEqual(initial);
  camera.scale /= 2;
  expect(labels()).toStrictEqual(initial);
});
