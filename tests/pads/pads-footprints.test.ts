import { test, expect } from "vitest";

import { readPadsFootprints } from "../../src/lib/pads/binary/footprints";
import type { PadsContainer } from "../../src/lib/pads/binary/container";
import type { PadsPadstack } from "../../src/lib/pads/binary/padstack";
import type { PadsPlacement } from "../../src/lib/pads/binary/metadata";
function sample() {
  const view = new DataView(new ArrayBuffer(1000)),
    sections = Array.from({ length: 75 }, (_, index) => ({
      index,
      count: 0,
      declaredBytes: 0,
      offset: 0,
      bytes: 0,
      records: 0,
    }));
  const i = (at: number, n: number) => view.setInt32(at, n, true),
    text = (at: number, s: string) =>
      new Uint8Array(view.buffer).set(new TextEncoder().encode(s), at);
  Object.assign(sections[14], { offset: 100, count: 1, declaredBytes: 112 });
  text(100, "JMPVIA_AAAAB");
  view.setUint16(164, 65534, true);
  i(172, 2);
  i(188, 2);
  Object.assign(sections[15], { offset: 300, count: 2, declaredBytes: 72 });
  i(300, 38100);
  text(320, "A");
  text(356, "B");
  i(372, 0);
  i(376, 1);
  i(380, 2);
  i(384, 2);
  Object.assign(sections[17], { offset: 500, count: 1, declaredBytes: 224 });
  text(500, "TYPE");
  i(560, -1);
  const c: PadsContainer = {
    view,
    sections,
    version: 0x2026,
    postLayerOffset: 0,
    containerItemsOffset: 0,
  };
  const pads = [0, 1, 2].map((index) => ({
    index,
    active: true,
  })) as PadsPadstack[];
  const placements = [
    {
      ordinal: 0,
      reference: { text: "U1", raw: new Uint8Array([85, 49]), offset: 0 },
      partType: 0,
      decal: null,
      alternate: 0,
    },
  ] as PadsPlacement[];
  return { c, pads, placements };
}
test("PADS links part type and footprint using default and per-terminal Padstack overrides", async () => {
  const { c, pads, placements } = sample(),
    r = await readPadsFootprints(c, pads, placements);
  expect(r.instances).toStrictEqual([{ placement: 0, footprint: 0 }]);
  expect(r.unresolved).toStrictEqual([]);
  expect(
    r.footprints[0].terminals.map((t) => [t.ordinal, t.name.text, t.padstack]),
  ).toStrictEqual([
    [1, "A", 1],
    [2, "B", 2],
  ]);
});
test("PADS reports missing instance references and rejects invalid terminal references", async () => {
  const { c, pads, placements } = sample();
  placements[0].partType = 9;
  const r = await readPadsFootprints(c, pads, placements);
  expect(r.unresolved.length).toBe(1);
  expect(r.instances.length).toBe(0);
  c.view.setInt32(380, 3, true);
  await expect(readPadsFootprints(c, pads, placements)).rejects.toThrow(
    /焊盘引用无效/,
  );
});

test("PADS explicit instance decal takes precedence over part-type choices", async () => {
  const { c, pads, placements } = sample();
  c.view.setInt32(552, 9, true);
  c.view.setInt32(556, 9, true);
  placements[0].decal = 0;
  const r = await readPadsFootprints(c, pads, placements);
  expect(r.partTypes[0].decals).toStrictEqual([9]);
  expect(r.instances).toStrictEqual([{ placement: 0, footprint: 0 }]);
  expect(r.unresolved).toStrictEqual([]);
});

test("PADS 0x2011 uses zero-based terminals and packed ordinal/pad mappings", async () => {
  const { c, pads, placements } = sample();
  c.version = 0x2011;
  new Uint8Array(c.view.buffer).fill(0, 100, 600);
  c.sections[14].declaredBytes = 92;
  c.view.setUint16(160, 65534, true);
  c.view.setUint16(166, 2, true);
  c.view.setInt32(180, 2, true);
  c.sections[15].declaredBytes = 40;
  c.view.setInt32(300, 38100, true);
  c.view.setInt32(324, 76200, true);
  c.view.setUint16(340, 0, true);
  c.view.setUint16(342, 1, true);
  c.view.setUint16(344, 2, true);
  c.view.setUint16(346, 2, true);
  c.sections[17].declaredBytes = 128;
  new Uint8Array(c.view.buffer).set(new TextEncoder().encode("TYPE"), 500);
  c.view.setInt16(552, -1, true);
  placements[0].partType = null;
  placements[0].decal = 0;
  const r = await readPadsFootprints(c, pads, placements);
  expect(r.footprints[0].terminals.map((t) => t.padstack)).toStrictEqual([
    1, 2,
  ]);
  expect(
    Math.abs(r.footprints[0].terminals[0].at[0] - 0.0254) < 1e-12,
  ).toBeTruthy();
  expect(
    Math.abs(r.footprints[0].terminals[1].at[1] - 0.0508) < 1e-12,
  ).toBeTruthy();
  expect(r.partTypes[0].decals).toStrictEqual([0]);
  expect(r.instances.length).toBe(1);
});
