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
test("strings consume their padded storage", () => {
  const b = Uint8Array.from([65, 66, 0, 0, 7, 0, 0, 0]).buffer;
  const r = new Reader(b);
  expect(r.cstring()).toBe("AB");
  expect(r.u32()).toBe(7);
});
test("unknown format fails instead of guessing record boundaries", () => {
  expect(() => new AllegroHeaderReader(new ArrayBuffer(64)).read()).toThrow(
    /不支持/,
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
    /越界/,
  );
});
