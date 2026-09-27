import { test, expect } from "vitest";

import type { BrdHeader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";

const header = { version: 174 } as BrdHeader;
test("geometry index scan preserves full-reader keys and record boundaries for every supported layout", () => {
  for (const version of [160, 162, 164, 165, 166, 172, 174, 175, 180, 181])
    for (const type of [1, 9, 0x14, 0x15, 0x16, 0x17])
      for (const key of [0, 1, 0xffffffff]) {
        const size =
            (type === 1
              ? 80
              : type === 9
                ? 44 + (version >= 174 ? 4 : 0)
                : type === 0x14
                  ? 32
                  : 40) + (version >= 172 ? 4 : 0),
          b = new ArrayBuffer(size + 4),
          v = new DataView(b);
        for (let i = 0; i < size; i++) v.setUint8(i, (i * 133 + 73) & 255);
        v.setUint8(0, type);
        v.setUint32(4, key, true);
        v.setUint32(size, 0xfeedcafe, true);
        const full = new Reader(b),
          scan = new Reader(b);
        full.skip(1);
        scan.skip(1);
        expect(
          new AllegroRecordReader(scan, { ...header, version }).scanKey(type),
        ).toBe(
          new AllegroRecordReader(full, { ...header, version }).read(type).Key,
        );
        expect(scan.offset).toBe(full.offset);
        expect(scan.offset).toBe(size);
        expect(scan.u32()).toBe(0xfeedcafe);
        // Every truncation must fail, including a complete key but incomplete body.
        for (let length = 1; length < size; length++) {
          const truncated = new Reader(b.slice(0, length));
          truncated.skip(1);
          expect(() =>
            new AllegroRecordReader(truncated, { ...header, version }).scanKey(
              type,
            ),
          ).toThrow(/越界/);
        }
      }
});
test("index scan retains validation for variable and unknown records", () => {
  const b = new ArrayBuffer(12),
    v = new DataView(b);
  v.setUint32(4, 8, true);
  const r = new Reader(b);
  r.skip(1);
  expect(() => new AllegroRecordReader(r, header).scanKey(0x21)).toThrow(
    /长度/,
  );
  expect(() =>
    new AllegroRecordReader(new Reader(b), header).scanKey(0xff),
  ).toThrow(/未知记录/);
  const text = new ArrayBuffer(32),
    t = new DataView(text);
  t.setUint32(4, 123, true);
  t.setUint16(22, 4, true);
  new Uint8Array(text).set([0xff, 0, 0, 0], 28);
  const reader = new Reader(text);
  reader.skip(1);
  expect(new AllegroRecordReader(reader, header).scanKey(0x31)).toBe(123);
  expect(reader.textDecoder.issues.size).toBe(1);
});
