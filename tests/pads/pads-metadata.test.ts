import { test, expect } from "vitest";

import {
  readPadsMetadata,
  PADS_BASIC_TO_MM,
} from "../../src/lib/pads/binary/metadata";
import type { PadsContainer } from "../../src/lib/pads/binary/container";
function sample(): PadsContainer {
  const view = new DataView(new ArrayBuffer(1200)),
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
  sections[1].count = 2;
  i(42, 2);
  view.setFloat32(82, 1, true);
  i(118, 1143000);
  i(122, 38100);
  Object.assign(sections[69], { count: 2, declaredBytes: 256, offset: 300 });
  text(312, "Unused");
  text(440, "Top");
  i(436, 1);
  i(472, 2);
  Object.assign(sections[23], { count: 1, declaredBytes: 424, offset: 600 });
  text(632, "GND");
  i(700, 123);
  i(704, 7);
  Object.assign(sections[22], { count: 1, declaredBytes: 112, offset: 900 });
  text(900, "U1");
  i(916, 38100);
  i(920, -38100);
  i(924, 90 * 1800000);
  i(928, 1);
  i(972, 3);
  i(976, 7);
  return {
    version: 0x2026,
    view,
    sections,
    postLayerOffset: 0,
    containerItemsOffset: 0,
  };
}
test("PADS metadata preserves source ordinal, previous-record layer type and BASIC placement geometry", async () => {
  const m = await readPadsMetadata(sample());
  expect(m.layers[1].name.text).toBe("Top");
  expect(m.layers[1].type).toBe(1);
  expect(m.nets[0].ordinal).toBe(0);
  expect(m.nets[0].self).toBe(123);
  expect(m.nets[0].name.text).toBe("GND");
  const p = m.placements[0];
  expect(p.reference.text).toBe("U1");
  expect(p.bottom).toBe(true);
  expect(p.partType).toBe(3);
  expect(p.at).toStrictEqual([
    38100 * PADS_BASIC_TO_MM,
    -38100 * PADS_BASIC_TO_MM,
  ]);
  expect(p.angle).toBe(Math.PI / 2);
  expect(p.decal).toBe(7);
});
test("PADS metadata retains invalid UTF-8 bytes and honours cancellation", async () => {
  const c = sample();
  c.view.setUint8(632, 255);
  const m = await readPadsMetadata(c);
  expect(m.nets[0].name.text).toBe(null);
  expect(m.nets[0].name.raw[0]).toBe(255);
  expect(m.diagnostics.length).toBe(1);
  const controller = new AbortController();
  controller.abort();
  await expect(
    readPadsMetadata(sample(), controller.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
});

test("PADS 0x2011 uses compact layers/net records and a 16-bit direct decal reference", async () => {
  const c = sample();
  c.version = 0x2011;
  new Uint8Array(c.view.buffer).fill(0, 300, 900);
  const text = (at: number, s: string) =>
    new Uint8Array(c.view.buffer).set(new TextEncoder().encode(s), at);
  c.sections[69].declaredBytes = 144;
  text(308, "Unused");
  text(380, "Top");
  c.view.setInt32(376, 1, true);
  c.view.setInt32(412, 2, true);
  c.sections[23].declaredBytes = 124;
  text(624, "GND");
  c.view.setUint16(622, 17, true);
  c.view.setUint32(704, 3, true);
  c.sections[22].declaredBytes = 84;
  c.view.setUint16(968, 123, true);
  c.view.setUint16(970, 7, true);
  c.view.setUint16(972, 65535, true);
  const m = await readPadsMetadata(c);
  expect(m.layers[1].name.text).toBe("Top");
  expect(m.layers[1].direction).toBe(2);
  expect(m.nets[0].name.text).toBe("GND");
  expect(m.nets[0].anchors).toStrictEqual([17, 3]);
  expect(m.placements[0].decal).toBe(7);
  expect(m.placements[0].partType).toBe(null);
  expect(m.placements[0].angle).toBe(Math.PI / 2);
});
