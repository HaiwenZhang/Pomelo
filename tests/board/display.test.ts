import { test, expect } from "vitest";

import {
  BoardDisplay,
  type DisplayCategory,
} from "../../src/lib/board/display";
import { BoardLayers } from "../../src/lib/board/layers";
import type { BoardScene, SpecialLayer } from "../../src/lib/board/model";

test("graphic layers use the board layer interface without format-specific casts", () => {
  const graphicLayer: SpecialLayer = {
    id: 0x30000,
    name: "Silkscreen",
    color: "#ffffff",
    kind: "graphic",
    category: "etch",
  };
  const scene: BoardScene = {
    layers: [],
    specialLayers: [graphicLayer],
    nets: new Map(),
    segments: [],
    vias: [],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    diagnostics: [],
  };

  expect(new BoardLayers(scene).name(graphicLayer.id)).toBe("Silkscreen");
  expect(
    BoardDisplay.isVisible(
      BoardDisplay.createDisplayOptions(),
      graphicLayer.id,
      graphicLayer.category,
    ),
  ).toBe(true);
});

test("Etch visibility includes copper text and zones but leaves pads and drill marks", () => {
  const original = { ...BoardDisplay.createDisplayOptions(), boardText: true };
  const display = BoardDisplay.setLayerVisibility(original, 2, "etch", false);
  for (const category of [
    "etch",
    "zone",
    "zone-outline",
    "text",
  ] as DisplayCategory[])
    expect(BoardDisplay.isVisible(display, 2, category)).toBe(false);
  for (const category of ["pin", "via", "drill"] as DisplayCategory[])
    expect(BoardDisplay.isVisible(display, 2, category)).toBe(true);
  expect(BoardDisplay.isVisible(display, 1, "etch")).toBe(true);
  expect(BoardDisplay.isVisible(display, 0x10002, "text")).toBe(true);
  expect(BoardDisplay.isVisible(original, 2, "etch")).toBe(true);
});

test("priority moves the complete Etch group; physical data and GPU batch references remain intact", () => {
  const batches = [
    { layer: 0, category: "etch", id: "top-track" },
    { layer: 0, category: "pin", id: "top-pin" },
    { layer: 2, category: "etch", id: "inner-track" },
    { layer: 0, category: "text", id: "top-text" },
    { layer: 0, category: "zone-outline", id: "top-boundary" },
    { layer: 0, category: "zone", id: "top-fill" },
    { layer: -1, category: "drill", id: "hole" },
    { layer: 2, category: "via", id: "inner-via" },
  ] satisfies { layer: number; category: DisplayCategory; id: string }[];
  const before = structuredClone(batches);
  const display = BoardDisplay.createDisplayOptions();
  display.priorities = [
    { layer: 0, category: "etch" },
    { layer: 2, category: "etch" },
  ];
  const sorted = BoardDisplay.orderBatches(batches, display);
  expect(sorted.slice(-5).map((b) => b.id)).toStrictEqual([
    "inner-track",
    "top-fill",
    "top-boundary",
    "top-track",
    "top-text",
  ]);
  expect(batches).toStrictEqual(before);
  for (const batch of sorted) expect(batches.includes(batch)).toBeTruthy();
  expect(
    sorted.findIndex((b) => b.id === "top-pin") <
      sorted.findIndex((b) => b.id === "inner-track"),
  ).toBeTruthy();
  display.activeLayer = 2;
  expect(BoardDisplay.orderBatches(batches, display).at(-1)?.id).toBe(
    "inner-track",
  );
  display.hidden.add(2);
  expect(BoardDisplay.isVisible(display, 2, "etch")).toBe(false);
  expect(display.hidden).toStrictEqual(new Set([2]));
  expect(
    BoardDisplay.orderBatches(sorted, BoardDisplay.createDisplayOptions()),
  ).toStrictEqual(
    BoardDisplay.orderBatches(batches, BoardDisplay.createDisplayOptions()),
  );
});

test("manual Via, Pin and drawing-text priorities do not promote unrelated classes", () => {
  const batches = [
    { layer: 0, category: "pin", part: 1 },
    { layer: 0, category: "pin", part: 2 },
    { layer: 0, category: "via", part: 0 },
    { layer: 0, category: "etch", part: 0 },
    { layer: 0x10006, category: "text", part: 0 },
  ] satisfies { layer: number; category: DisplayCategory; part: number }[];
  const display = BoardDisplay.createDisplayOptions();
  display.priorities = [
    { layer: 0, category: "pin" },
    { layer: 0x10006, category: "text" },
    { layer: 0, category: "via" },
  ];
  expect(
    BoardDisplay.orderBatches(batches, display).map((b) => [
      b.category,
      b.part,
    ]),
  ).toStrictEqual([
    ["etch", 0],
    ["via", 0],
    ["text", 0],
    ["pin", 1],
    ["pin", 2],
  ]);
  display.activeLayer = 0;
  expect(BoardDisplay.orderBatches(batches, display).at(-1)?.category).toBe(
    "etch",
  );
});

test("layer and global controls mask local preferences without overwriting them", () => {
  const display = BoardDisplay.setLayerVisibility(
    BoardDisplay.createDisplayOptions(),
    2,
    "via",
    false,
  );
  display.hidden.add(1);
  expect(BoardDisplay.isVisible(display, 1, "pin")).toBe(false);
  expect(BoardDisplay.isVisible(display, 2, "via")).toBe(false);
  expect(BoardDisplay.isVisible(display, 3, "via")).toBe(true);
  expect(BoardDisplay.isVisible({ ...display, vias: false }, 3, "via")).toBe(
    false,
  );
  expect(BoardDisplay.isVisible(display, -1, "drill")).toBe(true);
  expect(
    BoardDisplay.isVisible({ ...display, drills: false }, -1, "drill"),
  ).toBe(false);
  const restored = BoardDisplay.setLayerVisibility(display, 2, "via", true);
  expect(BoardDisplay.isVisible(restored, 2, "via")).toBe(true);
  expect(BoardDisplay.isVisible(display, 2, "via")).toBe(false);
});
