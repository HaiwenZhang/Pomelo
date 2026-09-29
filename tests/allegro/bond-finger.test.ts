import { test, expect } from "vitest";

import type { RawRecord } from "../../src/lib/allegro/binary/record-types";
type Raw = RawRecord & { type: number };
import { AllegroBondFingerDecoder } from "../../src/lib/allegro/decoders/bond-finger";
import type { BoardScene, Via } from "../../src/lib/board/model";

import { BoardDisplay } from "../../src/lib/board/display";
import { BoardSearchIndex } from "../../src/lib/board/search";
import { BoardIndex, selectionScene } from "../../src/lib/interaction/picking";

import { hoverDetails } from "../../src/lib/interaction/hover-details";

test("bond finger placement preserves native rotation without accepting drilled or mirrored variants", () => {
  const r: Raw = { type: 51, LayerInfo: 0xc012, Unknown5: 90000 };
  const s: Raw = {
    type: 28,
    PadType: 30,
    StartLayer: 0,
    LayerCount: 1,
    Plated: false,
    DrillSize: 0,
    SlotX: 0,
    SlotY: 0,
  };
  const top = new AllegroBondFingerDecoder(4).placement(r, s)!,
    bottom = new AllegroBondFingerDecoder(4).placement(
      { ...r, Unknown5: 270000 },
      s,
    )!;
  expect(Math.abs(top.angle - Math.PI / 2) < 1e-12).toBeTruthy();
  expect(top.back).toBe(false);
  expect(Math.abs(bottom.angle - Math.PI * 1.5) < 1e-12).toBeTruthy();
  expect(bottom.back).toBe(false);
  for (const patch of [
    { LayerInfo: 0xc112 },
    { Unknown5: NaN },
    { Unknown5: 360000 },
  ])
    expect(
      new AllegroBondFingerDecoder(4).placement({ ...r, ...patch }, s),
    ).toBe(undefined);
  for (const patch of [
    { LayerCount: 4 },
    { DrillSize: 1270 },
    { PadType: 4 },
    { StartLayer: 4 },
    { Plated: true },
  ])
    expect(
      new AllegroBondFingerDecoder(4).placement(r, { ...s, ...patch }),
    ).toBe(undefined);
});
test("finger picking, selection, component search and tooltip share its rotated Via-layer geometry", async () => {
  const finger: Via = {
    id: 29158,
    net: 1,
    at: [0, 0],
    padstack: 645,
    padstackName: "R_MM0P1X0P15_FINGER",
    startLayer: 0,
    endLayer: 0,
    drill: 0,
    angle: Math.PI / 2,
    back: false,
    finger: { reference: "U2", name: "26", sourcePin: 18011 },
    pads: [{ layer: 0, type: 6, width: 0.215, height: 0.13, offset: [0, 0] }],
  };
  const scene: BoardScene = {
    layers: [{ id: 0, name: "TOP", color: "#58b5ed" }],
    nets: new Map([[1, "N2351092"]]),
    segments: [],
    vias: [finger],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
  };
  const index = new BoardIndex(scene),
    display = { ...BoardDisplay.createDisplayOptions(), filled: true };
  const hit = index.pick([0, 0.09], 1000, display, "finger")!;
  expect(hit.object.kind).toBe("finger");
  expect(hit.category).toBe("via");
  expect(index.pick([0.09, 0], 1000, display, "finger")).toBe(null);
  expect(index.pick([0, 0.09], 1000, display, "via")).toBe(null);
  expect(
    index.pick(
      [0, 0.09],
      1000,
      BoardDisplay.setLayerVisibility(display, 0, "via", false),
      "finger",
    ),
  ).toBe(null);
  expect(
    selectionScene(scene, index.select(hit, "object").objects).vias[0],
  ).toBe(finger);
  expect(index.select(hit, "component").objects).toStrictEqual([hit.object]);
  expect(
    BoardSearchIndex.buildItems(scene).find((i) => i.kind === "component"),
  ).toStrictEqual({
    kind: "component",
    id: "U2",
    name: "U2",
    count: 1,
  });
  const text = await hoverDetails(
    scene,
    index,
    hit,
    "object",
    new AbortController().signal,
  );
  expect(text[0]).toBe("Bond finger: U2.26");
  expect(text.includes("Rotation: 90.000 deg")).toBeTruthy();
  expect(
    !text.some((t) => t.includes("Drill:") || t.includes("TOP : TOP")),
  ).toBeTruthy();
});
