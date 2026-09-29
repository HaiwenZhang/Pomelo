import { expect, test } from "vitest";
import type { AltiumPropertiesRecord } from "../../src/lib/altium/binary/properties";
import type { AltiumLayers } from "../../src/lib/altium/layers";
import { AltiumLayerResolver } from "../../src/lib/altium/scene/layer-resolver";
import { AltiumFillBuilder } from "../../src/lib/altium/scene/fill-scene";
import { AltiumRegionBuilder } from "../../src/lib/altium/scene/region-scene";

const board: AltiumPropertiesRecord = {
  offset: 0,
  flags: 0,
  raw: new Uint8Array(),
  fields: new Map([["LAYER40NAME", "Mechanical"]]),
  utf8Fields: new Map(),
};
const stack: AltiumLayers = {
  layers: [
    { id: 0, name: "Top", color: "red" },
    { id: 1, name: "Bottom", color: "blue" },
  ],
  v6: new Map([
    [1, 0],
    [32, 1],
  ]),
  v7: new Map([[0x01000001, 0]]),
  stackSource: "v9",
};
function record(type: number, body: Uint8Array): Uint8Array {
  const data = new Uint8Array(5 + body.length);
  data[0] = type;
  new DataView(data.buffer).setUint32(1, body.length, true);
  data.set(body, 5);
  return data;
}
function fill(): Uint8Array {
  const body = new Uint8Array(37),
    view = new DataView(body.buffer);
  body[0] = 40;
  view.setUint16(3, 0xffff, true);
  view.setInt32(21, 10000, true);
  view.setInt32(25, 10000, true);
  return record(6, body);
}
function region(): Uint8Array {
  const properties = new TextEncoder().encode("KIND=0");
  const body = new Uint8Array(22 + properties.length + 4 + 4 * 16),
    view = new DataView(body.buffer);
  body[0] = 40;
  view.setUint32(18, properties.length, true);
  body.set(properties, 22);
  let at = 22 + properties.length;
  view.setUint32(at, 4, true);
  at += 4;
  for (const [x, y] of [
    [0, 0],
    [10000, 0],
    [10000, 10000],
    [0, 10000],
  ]) {
    view.setFloat64(at, x, true);
    view.setFloat64(at + 8, y, true);
    at += 16;
  }
  return record(11, body);
}

test("Fill and Region on the same mechanical layer keep one definition in either build order", async () => {
  const build = async (reverse: boolean) => {
    const layerResolver = new AltiumLayerResolver(stack, board);
    const input = {
      stack,
      board,
      layerResolver,
      nets: new Map<number, string>(),
      count: 1,
    };
    const builders = [
      new AltiumFillBuilder({ ...input, data: fill() }),
      new AltiumRegionBuilder({ ...input, data: region(), polygons: [] }),
    ];
    if (reverse) builders.reverse();
    for (const builder of builders) await builder.build();
    return layerResolver.drawings;
  };
  expect(await build(false)).toEqual(await build(true));
  expect(await build(false)).toEqual([
    {
      id: 0x20000 + 40,
      name: "Mechanical",
      color: "#a7a9bd",
      layerFunction: "unknown",
      defaultVisible: true,
    },
  ]);
});

test("overlay appearance and copper aliases are independent of registration order", () => {
  const resolver = new AltiumLayerResolver(stack, board);
  resolver.drawing(34);
  resolver.drawing(33);
  resolver.drawing(34);
  expect(resolver.drawings).toHaveLength(2);
  expect(resolver.drawings.map((layer) => layer.defaultVisible)).toEqual([
    false,
    true,
  ]);
  expect(resolver.copper(1)).toBe(0);
  expect(resolver.copper(99, 0x01000001)).toBe(0);
  expect(resolver.copper(40)).toBeUndefined();
});
