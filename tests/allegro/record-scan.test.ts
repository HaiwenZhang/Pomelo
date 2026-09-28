import { test, expect } from "vitest";

import type { BrdHeader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";
import { getScannableRecordByteLength } from "../../src/lib/allegro/binary/record-scan";

const header = { version: 174 } as BrdHeader;
const fixedTypes = [
  0x01, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
  0x11, 0x12, 0x14, 0x15, 0x16, 0x17, 0x1b, 0x20, 0x22, 0x23, 0x24, 0x26, 0x28,
  0x29, 0x2b, 0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x32, 0x33, 0x34, 0x35, 0x37, 0x38,
  0x39, 0x3a, 0x3e,
];
const legacyStringTypes = [0x07, 0x08, 0x0d, 0x0f, 0x10, 0x11];

test.each([
  152, 157, 160, 162, 164, 165, 166, 172, 174, 175, 180, 181, 190, 251,
])(
  "V%s fixed-record scans match full decoding and reject every truncated body",
  (version) => {
    for (const type of fixedTypes) {
      const inlineString =
        (version < 160 && legacyStringTypes.includes(type)) ||
        (version < 166 && type === 0x38);
      if (inlineString) {
        expect(getScannableRecordByteLength(type, version)).toBeUndefined();
        continue;
      }
      let size = 0;
      for (const key of [0, 1, 0xffffffff]) {
        const buffer = new ArrayBuffer(512),
          view = new DataView(buffer);
        for (let i = 0; i < buffer.byteLength; i++)
          view.setUint8(i, (i * 133 + 73) & 255);
        if (version < 160) view.setUint16(0, (type << 10) | 0x3ff, true);
        else view.setUint8(0, type);
        view.setUint32(4, key, true);
        const full = new Reader(buffer),
          scan = new Reader(buffer);
        expect(full.recordType(version)).toBe(type);
        expect(scan.recordType(version)).toBe(type);
        const record = new AllegroRecordReader(full, {
          ...header,
          version,
        }).read(type);
        size = full.offset;
        expect(getScannableRecordByteLength(type, version)).toBe(size);
        view.setUint32(size, 0xfeedcafe, true);
        expect(
          new AllegroRecordReader(scan, { ...header, version }).scanKey(type),
        ).toBe(record.Key);
        expect(scan.offset).toBe(size);
        expect(scan.u32()).toBe(0xfeedcafe);
      }
      // Even records with an already readable key require their entire body.
      for (let length = 1; length < size; length++) {
        const truncated = new Reader(new ArrayBuffer(length));
        truncated.skip(1);
        expect(() =>
          new AllegroRecordReader(truncated, { ...header, version }).scanKey(
            type,
          ),
        ).toThrow(/exceeds the file/);
      }
    }
  },
);

test("scanning legacy inline strings retains encoding diagnostics and boundaries", () => {
  for (const version of [152, 157, 160, 162, 164, 165]) {
    for (const type of version < 160 ? [...legacyStringTypes, 0x38] : [0x38]) {
      const buffer = new ArrayBuffer(128),
        view = new DataView(buffer);
      if (version < 160) view.setUint16(0, (type << 10) | 0x300, true);
      else view.setUint8(0, type);
      view.setUint32(4, 0xffffffff, true);
      const textOffset = type === 0x38 ? 16 : 8;
      view.setUint8(textOffset, 0xff);
      const full = new Reader(buffer),
        scan = new Reader(buffer);
      full.recordType(version);
      scan.recordType(version);
      const fullRecord = new AllegroRecordReader(full, {
        ...header,
        version,
      }).read(type);
      expect(
        new AllegroRecordReader(scan, { ...header, version }).scanKey(type),
      ).toBe(fullRecord.Key);
      expect(scan.offset).toBe(full.offset);
      expect(scan.textDecoder.issues.get(textOffset)).toEqual({
        offset: textOffset,
        length: 1,
        encoding: "utf-8",
      });
      expect(scan.textDecoder.issues.size).toBe(1);
    }
  }
});

test("paired-net version validation is retained during scanning", () => {
  const reader = new Reader(new ArrayBuffer(128));
  reader.skip(1);
  expect(() =>
    new AllegroRecordReader(reader, { ...header, version: 166 }).scanKey(0x1a),
  ).toThrow(/unverified/);
});

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
          ).toThrow(/exceeds the file/);
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
    /blob length/,
  );
  expect(() =>
    new AllegroRecordReader(new Reader(b), header).scanKey(0xff),
  ).toThrow(/Unknown BRD record/);
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
