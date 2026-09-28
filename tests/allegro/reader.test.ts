import { test, expect } from "vitest";

import { AllegroHeaderReader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";

test("bounded reads report exact offset", () => {
  const reader = new Reader(new ArrayBuffer(4));
  reader.u32();
  expect(() => reader.u8()).toThrow(/0x4/);
  expect(() => reader.skip(-1)).toThrow();
  expect(() => reader.seek(-1)).toThrow();
});
test("fractional array counts fail before consuming binary data", () => {
  const reader = new Reader(Uint8Array.from([1, 2, 3, 4]).buffer);

  expect(() => reader.u16(0.5)).toThrow(/count/i);
  expect(reader.offset).toBe(0);
  expect(reader.u16()).toBe(0x0201);
});
test("Allegro doubles contain high word followed by low word", () => {
  const b = new ArrayBuffer(8),
    v = new DataView(b);
  v.setUint32(0, 0x3ff80000, true);
  v.setUint32(4, 0, true);
  expect(new Reader(b).float()).toBe(1.5);
});

test("repeated Allegro doubles retain signed zero, subnormals, infinities and NaN", () => {
  const values = [1.5, -123.75, -0, Number.MIN_VALUE, Infinity, -Infinity, NaN];
  const buffer = new ArrayBuffer(values.length * 8),
    view = new DataView(buffer);
  const scratch = new DataView(new ArrayBuffer(8));
  values.forEach((value, i) => {
    scratch.setFloat64(0, value);
    view.setUint32(i * 8, scratch.getUint32(0), true);
    view.setUint32(i * 8 + 4, scratch.getUint32(4), true);
  });
  const reader = new Reader(buffer);
  for (const value of values)
    expect(Object.is(reader.float(), value)).toBe(true);
  expect(() => reader.float()).toThrow(/exceeds the file/);
});
test("strings consume their padded storage", () => {
  const b = Uint8Array.from([65, 66, 0, 0, 7, 0, 0, 0]).buffer;
  const r = new Reader(b);
  expect(r.cstring()).toBe("AB");
  expect(r.u32()).toBe(7);
});
test("unknown format fails instead of guessing record boundaries", () => {
  expect(() => new AllegroHeaderReader(new ArrayBuffer(64)).read()).toThrow(
    /Unsupported/,
  );
});

test("documented 17.x format aliases use their corresponding record layouts", () => {
  for (const [magic, version] of [
    [0x140500, 172],
    [0x140600, 172],
    [0x140700, 172],
    [0x140e00, 174],
  ]) {
    const buffer = new ArrayBuffer(0x1200),
      view = new DataView(buffer);
    view.setUint32(0, magic, true);
    view.setUint32(0x26c, 100, true);
    expect(new AllegroHeaderReader(buffer).read().version).toBe(version);
  }
});
test("string alignment uses absolute stream position", () => {
  const r = new Reader(Uint8Array.from([99, 65, 0, 0, 9, 0, 0, 0]).buffer);
  r.skip(1);
  expect(r.str(2)).toBe("A");
  expect(r.u32()).toBe(9);
});
test("unterminated string fails at the input boundary", () => {
  expect(() => new Reader(Uint8Array.from([65, 66]).buffer).cstring()).toThrow(
    /exceeds the file/,
  );
});

test("C strings preserve empty values, UTF-8 diagnostics and absolute padding", () => {
  const reader = new Reader(
    Uint8Array.from([99, 0, 88, 88, 0xe4, 0xb8, 0xad, 0, 0xff, 0, 88, 88])
      .buffer,
  );
  reader.seek(1);
  expect(reader.cstring()).toBe("");
  expect(reader.offset).toBe(4);
  expect(reader.cstring()).toBe("中");
  expect(reader.offset).toBe(8);
  expect(reader.cstring()).toBe("\ufffd");
  expect(reader.offset).toBe(12);
  expect(reader.textDecoder.issues.get(8)).toEqual({
    offset: 8,
    length: 1,
    encoding: "utf-8",
  });
});

test("C strings still validate missing terminators and incomplete padding", () => {
  const unterminated = new Reader(Uint8Array.from([65, 66]).buffer);
  expect(() => unterminated.cstring()).toThrow(/0x2/);
  expect(unterminated.offset).toBe(2);
  const unpadded = new Reader(Uint8Array.from([65, 0]).buffer);
  expect(() => unpadded.cstring()).toThrow(/0x2/);
});

test("C strings retain packed legacy flag-byte behavior", () => {
  for (const flags of [0, 0x300]) {
    const buffer = new ArrayBuffer(4),
      view = new DataView(buffer);
    view.setUint16(0, (0x07 << 10) | flags, true);
    const reader = new Reader(buffer);
    expect(reader.recordType(152)).toBe(0x07);
    expect(reader.cstring()).toBe(
      flags ? String.fromCharCode(view.getUint8(1)) : "",
    );
    expect(reader.offset).toBe(4);
  }
});

test("C strings retain a packed flag substitution after seeking before its tag", () => {
  const buffer = Uint8Array.from([65, 66, 67, 68, 1, 0, 90, 0]).buffer;
  const reader = new Reader(buffer);
  reader.seek(4);
  expect(reader.recordType(152)).toBe(0);
  reader.seek(0);
  expect(reader.cstring()).toBe("ABCD\u0001\u0000Z");
  expect(reader.offset).toBe(8);
});
