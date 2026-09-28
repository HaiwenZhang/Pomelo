import { test, expect } from "vitest";

import { AllegroHeaderReader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";

test("0x141402 keeps its identity and reads the extended definition table stride", () => {
  const file = new ArrayBuffer(0x1200),
    view = new DataView(file);
  view.setUint32(0, 0x141402, true);
  view.setUint32(0x26c, 1000, true);
  new Uint8Array(file).set(new TextEncoder().encode("original writer"), 0xf8);
  const header = new AllegroHeaderReader(file).read();
  expect(header.magic).toBe(0x141402);
  expect(header.version).toBe(175);
  expect(header.writerVersion).toBe("original writer");
  expect(header.divisor).toBe(1000);
  // The shorter V174 slot desynchronizes this exact table family. The new
  // format mapping must preserve both slots and the following record boundary.
  const b = new ArrayBuffer(36 + 2 * 32 + 4),
    v = new DataView(b);
  v.setUint8(0, 0x36);
  v.setUint16(2, 5, true);
  v.setUint32(16, 2, true);
  v.setUint32(20, 2, true);
  v.setUint32(36 + 2 * 32, 0xfeedcafe, true);
  const r = new Reader(b);
  r.skip(1);
  const record = new AllegroRecordReader(r, header).read(0x36);
  expect(record.Stride).toBe(32);
  expect(r.u32()).toBe(0xfeedcafe);
  view.setUint32(0, 0x141302, true);
  expect(() => new AllegroHeaderReader(file).read()).toThrow(/Unsupported/);
});
