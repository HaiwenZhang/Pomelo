import { expect, test } from "vitest";
import type { AltiumPropertiesRecord } from "../../src/lib/altium/binary/properties";
import type { AltiumLayers } from "../../src/lib/altium/layers";
import { ALTIUM_MM } from "../../src/lib/altium/records/primitives";
import { AltiumRouteBuilder } from "../../src/lib/altium/scene/route-scene";

const board: AltiumPropertiesRecord = {
  offset: 0,
  flags: 0,
  raw: new Uint8Array(),
  fields: new Map(),
  utf8Fields: new Map(),
};
const stack: AltiumLayers = {
  layers: ["Top", "Inner1", "Inner2", "Bottom"].map((name, id) => ({
    id,
    name,
    color: "red",
  })),
  v6: new Map([
    [1, 0],
    [2, 1],
    [3, 2],
    [32, 3],
  ]),
  v7: new Map(),
  stackSource: "legacy",
};

test.each([
  [1, 1],
  [2, 2],
])(
  "via bounds include a larger layer diameter in padstack mode %i",
  async (mode, overrideIndex) => {
    const data = new Uint8Array(5 + 203),
      view = new DataView(data.buffer),
      at = 5;
    data[0] = 3;
    view.setUint32(1, 203, true);
    view.setUint16(at + 3, 0xffff, true);
    view.setInt32(at + 13, 1000, true);
    view.setInt32(at + 17, 2000, true);
    view.setInt32(at + 21, 10000, true);
    view.setInt32(at + 25, 5000, true);
    data[at + 29] = 1;
    data[at + 30] = 32;
    data[at + 74] = mode;
    view.setInt32(at + 75 + overrideIndex * 4, 80000, true);
    const result = await new AltiumRouteBuilder({
      streams: { tracks: new Uint8Array(), arcs: new Uint8Array(), vias: data },
      counts: { tracks: 0, arcs: 0, vias: 1 },
      stack,
      board,
      nets: new Map(),
    }).build();
    expect(result.vias).toHaveLength(1);
    const radius = 40000 * ALTIUM_MM,
      x = 1000 * ALTIUM_MM,
      y = -2000 * ALTIUM_MM;
    expect(result.bounds.minX).toBeCloseTo(x - radius, 12);
    expect(result.bounds.minY).toBeCloseTo(y - radius, 12);
    expect(result.bounds.maxX).toBeCloseTo(x + radius, 12);
    expect(result.bounds.maxY).toBeCloseTo(y + radius, 12);
  },
);
