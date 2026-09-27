import { test, expect } from "vitest";

import type { Raw } from "../../src/lib/allegro/binary/reader";
import { AllegroPadstackResolver } from "../../src/lib/allegro/decoders/padstack";
import type { BoardScene, Pin } from "../../src/lib/board/model";

import { BoardDisplay } from "../../src/lib/board/display";
import { BoardLayers, BOND_TOP_LAYER } from "../../src/lib/board/layers";

import { BoardIndex, selectionScene } from "../../src/lib/interaction/picking";

import { Camera } from "../../src/lib/interaction/camera";
import { hoverDetails } from "../../src/lib/interaction/hover-details";
import {
  BoardLabelLayout,
  type FontAtlas,
} from "../../src/lib/render/board-label-layout";
import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";

test("die reference resolves BOND TOP without inventing a physical copper layer", () => {
  const stack: Raw = {
    type: 28,
    StartLayer: 0,
    LayerCount: 1,
    PadType: 26,
    Plated: false,
    DrillSize: 0,
    SlotX: 0,
    SlotY: 0,
  };
  const wrapper: Raw = {
    type: 47,
    Type: 0,
    T2: 0xfc00,
    UnknownArray: [663, 18043, 1, 0, 0, 8],
  };
  const resolve = (r = wrapper, s = stack, version = 172) =>
    new AllegroPadstackResolver(
      (id) => (id === 663 ? s : id === 28168 ? r : undefined),
      4,
      version,
    ).resolvePin(28168, 18043);
  expect(resolve()).toStrictEqual({ stack, die: true });
  expect(resolve(wrapper, stack, 166)).toBe(undefined);
  for (const patch of [{ T2: 0xfd00 }, { T2: 0 }, { Type: 1 }])
    expect(resolve({ ...wrapper, ...patch })).toBe(undefined);
  for (const [i, n] of [
    [1, 99],
    [2, 4],
    [3, 1],
    [4, 1],
    [5, 16],
  ]) {
    const words = [...wrapper.UnknownArray];
    words[i] = n;
    expect(resolve({ ...wrapper, UnknownArray: words })).toBe(undefined);
  }
  for (const patch of [
    { PadType: 10 },
    { StartLayer: 1 },
    { LayerCount: 4 },
    { DrillSize: 1 },
    { Plated: true },
  ])
    expect(resolve(wrapper, { ...stack, ...patch })).toBe(undefined);
});

test("die geometry uses Etch visibility while Pin labels and Pin selection stay independent", async () => {
  const pin: Pin = {
    id: 18043,
    net: 1,
    name: "23",
    reference: "U2",
    at: [0, 0],
    angle: 0,
    back: false,
    drill: 0,
    shapes: [
      {
        layer: BOND_TOP_LAYER,
        type: 5,
        width: 0.0761,
        height: 0.0761,
        offset: [0, 0],
      },
    ],
    die: { sourceReference: 28168, padstackName: "S_MM0P076068DIE" },
  };
  const scene: BoardScene = {
    layers: Array.from({ length: 4 }, (_, id) => ({
      id,
      name: `L${id + 1}`,
      color: "#58b5ed",
    })),
    specialLayers: [
      {
        id: BOND_TOP_LAYER,
        name: "BOND TOP",
        color: "#d7cd58",
        kind: "die-pad",
        category: "etch",
      },
    ],
    nets: new Map([[1, "AGND"]]),
    pins: [pin],
    vias: [],
    segments: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  };
  expect(new BoardLayers(scene).all().length).toBe(5);
  expect(scene.layers.length).toBe(4);
  const display = {
      ...BoardDisplay.createDisplayOptions(),
      filled: true,
      pins: false,
      hidden: new Set([0, 1, 2, 3]),
    },
    index = new BoardIndex(scene);
  const hit = index.pick([0, 0], 3000, display, "pin")!;
  expect(hit.object.kind).toBe("pin");
  expect(hit.category).toBe("etch");
  expect(hit.layer).toBe(BOND_TOP_LAYER);
  expect(index.pick([0, 0], 3000, display, "via")).toBe(null);
  const hidden = BoardDisplay.setLayerVisibility(
    display,
    BOND_TOP_LAYER,
    "etch",
    false,
  );
  expect(index.pick([0, 0], 3000, hidden, "pin")).toBe(null);
  const selected = selectionScene(
    scene,
    index.select(hit, "component").objects,
  );
  expect(selected.specialLayers).toBe(scene.specialLayers);
  const batches = new PrimitiveBatchBuilder(selected)
    .build()
    .filter((b) => b.data.length);
  expect(batches.length).toBeTruthy();
  expect(
    batches.every((b) => b.layer === BOND_TOP_LAYER && b.category === "etch"),
  ).toBeTruthy();
  expect(
    batches.every(
      (b) =>
        BoardDisplay.isBatchVisible(display, b) &&
        !BoardDisplay.isBatchVisible(hidden, b),
    ),
  ).toBeTruthy();
  const font: FontAtlas = {
    size: 128,
    range: 8,
    glyphs: Object.fromEntries(
      [..."AGND?"].map((c) => [
        c,
        { advance: 0.6, plane: [0, 0, 0.5, 1], uv: [0, 0, 1, 1] },
      ]),
    ),
  };
  const camera = new Camera();
  camera.scale = 3000;
  const labels = BoardLabelLayout.layout({
    scene,
    font,
    camera,
    width: 800,
    height: 600,
    options: display,
  });
  expect(labels.get(`etch:${BOND_TOP_LAYER}`)?.length).toBeTruthy();
  expect(
    BoardLabelLayout.layout({
      scene,
      font,
      camera,
      width: 800,
      height: 600,
      options: { ...display, pinNames: false },
    }).size,
  ).toBe(0);
  expect(
    BoardLabelLayout.layout({
      scene,
      font,
      camera,
      width: 800,
      height: 600,
      options: hidden,
    }).size,
  ).toBe(0);
  const details = await hoverDetails(
    scene,
    index,
    hit,
    "object",
    new AbortController().signal,
  );
  expect(details[0]).toBe("Die pad: U2.23");
  expect(details.includes("Layer: BOND TOP")).toBeTruthy();
});
