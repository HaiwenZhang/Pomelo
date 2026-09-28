import { test, expect } from "vitest";

import type { BrdHeader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";
import { BrdTextDecoder } from "../../src/lib/allegro/binary/text-decoder";

function property(
  version: number,
  payload: number[],
  name = "STEP3D_SAMPLE",
  type = "",
  subtype = 0,
  flags = 0x10000,
) {
  const start = version >= 172 ? 180 : 176;
  const buffer = new ArrayBuffer(start + Math.ceil(payload.length / 4) * 4 + 4),
    view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  bytes[0] = 0x3b;
  view.setUint16(2, subtype, true);
  view.setUint32(4, payload.length, true);
  bytes.set(new TextEncoder().encode(name), 8);
  bytes.set(new TextEncoder().encode(type), 136);
  view.setUint32(start - 4, flags, true);
  bytes.set(payload, start);
  view.setUint32(buffer.byteLength - 4, 0x12345678, true);
  const decoder = new BrdTextDecoder(),
    reader = new Reader(buffer, decoder);
  reader.u8();
  return {
    buffer,
    reader,
    decoder,
    record: new AllegroRecordReader(reader, { version } as BrdHeader).read(
      0x3b,
    ),
    start,
  };
}
test("embedded model bytes retain NULs, invalid UTF-8 and alignment across layouts", () => {
  for (const version of [166, 172, 174, 175, 181])
    for (const name of ["STEP3D_SAMPLE", "sample.STEP.sab.z"]) {
      const raw = [0x78, 0x9c, 0xff, 0, 0x80, 0, 0x61],
        r = property(version, raw, name);
      expect(r.record.PayloadKind).toBe("embedded-model");
      expect(r.record.Value).toBe(undefined);
      expect([...r.record.ValueBytes]).toStrictEqual(raw);
      expect(r.record.ValueBytes.buffer).toBe(r.buffer);
      expect(r.decoder.issues.size).toBe(0);
      expect(r.reader.u32()).toBe(0x12345678);
    }
});
test("named text and unrecognized metadata retain strict decoding diagnostics", () => {
  for (const [name, type, subtype, flags] of [
    ["STEP3D_SAMPLE", "TEXT", 0, 0x10000],
    ["STEP3D_SAMPLE", "", 2, 0x10000],
    ["STEP3D_SAMPLE", "", 0, 0],
    ["WFM_HEADER", "CSNHOJ", 2, 0x10000],
  ] as const) {
    const r = property(174, [0xff, 0, 1], name, type, subtype, flags);
    expect(r.record.PayloadKind).toBe(undefined);
    expect(r.record.Value).toBe("�");
    expect([...r.decoder.issues.keys()]).toStrictEqual([r.start]);
    expect(r.reader.u32()).toBe(0x12345678);
  }
});
test("truncated binary attachments fail rather than dropping missing bytes", () => {
  const r = property(174, [0x78, 0x9c, 0]);
  new DataView(r.buffer).setUint32(4, 99999, true);
  const reader = new Reader(r.buffer);
  reader.u8();
  expect(() =>
    new AllegroRecordReader(reader, { version: 174 } as BrdHeader).read(0x3b),
  ).toThrow(/exceeds the file/);
});
