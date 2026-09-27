import { expect, test } from "vitest";
import type { BoardScene } from "../../src/lib/board/model";
import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";

const scene: BoardScene = {
  layers: [{ id: 0, name: "TOP", color: "#4080c0" }],
  nets: new Map([
    [1, "GND"],
    [2, "VCC"],
  ]),
  segments: [
    { id: 1, trackId: 1, layer: 0, net: 1, a: [0, 0], b: [1, 0], width: 0.1 },
    { id: 2, trackId: 2, layer: 0, net: 2, a: [0, 1], b: [1, 1], width: 0.1 },
    { id: 3, trackId: 3, layer: 0, net: 0, a: [0, 2], b: [1, 2], width: 0.1 },
  ],
  pins: [
    {
      id: 4,
      net: 1,
      name: "1",
      reference: "U1",
      at: [1, 1],
      angle: 0,
      back: false,
      drill: 0,
      shapes: [{ layer: 0, type: 2, width: 1, height: 1, offset: [0, 0] }],
    },
  ],
  vias: [
    {
      id: 5,
      net: 2,
      at: [1, 2],
      padstack: 1,
      drill: 0,
      startLayer: 0,
      endLayer: 0,
      pads: [{ layer: 0, type: 2, width: 1, height: 1, offset: [0, 0] }],
    },
  ],
  zones: [
    {
      id: 6,
      layer: 0,
      net: 1,
      paths: [],
      rings: [],
      points: new Float64Array([0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
      outerCount: 3,
    },
  ],
  outline: [],
  texts: [],
  drawingLayers: [],
  bounds: { minX: 0, minY: 0, maxX: 2, maxY: 2 },
  diagnostics: [],
};

function colors(mode: "layer" | "net") {
  const batches = new PrimitiveBatchBuilder(scene, mode).build();
  const batch = (category: string) =>
    batches.find((value) => value.category === category)!;
  const entries = (category: string) => {
    const data = batch(category).data;
    return Array.from({ length: data.length / 12 }, (_, index) => [
      ...data.slice(index * 12 + 8, index * 12 + 11),
    ]);
  };
  return { batch, entries };
}
const rgb = (r: number, g: number, b: number) =>
  [r, g, b].map((value) => Math.fround(value / 255));

test("Color By Net colors copper by net while leaving unassigned copper on its layer color", () => {
  const { batch, entries } = colors("net");
  expect(entries("etch")).toEqual([
    rgb(26, 58, 95),
    rgb(42, 174, 111),
    rgb(64, 128, 192),
  ]);
  expect(entries("pin")[0]).toEqual(rgb(26, 58, 95));
  expect(entries("via")[0]).toEqual(rgb(42, 174, 111));
  expect([...batch("zone").color!]).toEqual([...rgb(26, 58, 95), 1]);
});

test("Color By Layer uses layer color for all copper regardless of net", () => {
  const { batch, entries } = colors("layer");
  expect(entries("etch")).toEqual(Array(3).fill(rgb(64, 128, 192)));
  expect([...batch("zone").color!]).toEqual([...rgb(64, 128, 192), 1]);
});
