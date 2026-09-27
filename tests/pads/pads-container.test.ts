import { test, expect } from "vitest";

import { readPadsContainer } from "../../src/lib/pads/binary/container";

function empty() {
  const count = 75,
    post = 6 + count * 16 + 12 + 4,
    footer = post + 19,
    b = new ArrayBuffer(footer + 42),
    v = new DataView(b),
    bytes = new Uint8Array(b);
  bytes[1] = 255;
  v.setUint16(2, 0x2026, true);
  v.setUint32(26, count, true);
  v.setUint32(14 + 71 * 16, 4, true);
  bytes[post + 4] = 8;
  bytes.set(new TextEncoder().encode("PowerSYS"), post + 5);
  bytes.set(
    new TextEncoder().encode("{2FE18320-6448-11d1-A412-000000000000}"),
    footer,
  );
  v.setUint32(footer + 38, post + 15, true);
  return b;
}
test("PADS directory framing derives physical extents rather than treating directory totals as offsets", () => {
  const c = readPadsContainer(empty());
  expect(c.sections.length).toBe(75);
  expect(c.version).toBe(0x2026);
  expect(c.sections[69].bytes).toBe(12);
  expect(c.sections[70].bytes).toBe(4);
  expect(c.sections[71].bytes).toBe(0);
  expect(c.containerItemsOffset - c.postLayerOffset).toBe(15);
});

test("PADS 0x2020 still uses 20-byte terminal records while 0x2021 requires 36", () => {
  const old = empty(),
    prefix = 6 + 75 * 16,
    b = new ArrayBuffer(old.byteLength + 20),
    bytes = new Uint8Array(b),
    v = new DataView(b);
  bytes.set(new Uint8Array(old, 0, prefix));
  bytes.set(new Uint8Array(old, prefix), prefix + 20);
  v.setUint16(2, 0x2020, true);
  v.setUint32(10 + 15 * 16, 1, true);
  v.setUint32(14 + 15 * 16, 20, true);
  v.setUint32(
    b.byteLength - 4,
    new DataView(old).getUint32(old.byteLength - 4, true) + 20,
    true,
  );
  expect(readPadsContainer(b).sections[15].bytes).toBe(20);
  v.setUint16(2, 0x2021, true);
  expect(() => readPadsContainer(b)).toThrow(/分节 15 记录尺寸/);
});
test("PADS framing rejects corrupt footer, record extents, paging counts and unknown versions", () => {
  const change = (at: number, value: number) => {
    const b = empty();
    new DataView(b).setUint32(at, value, true);
    return b;
  };
  expect(() => readPadsContainer(empty().slice(0, 30))).toThrow(/越界/);
  expect(() => readPadsContainer(change(2, 0x2010))).toThrow(/布局尚待核验/);
  expect(() => readPadsContainer(change(26, 0xffffffff))).toThrow(/分节数量/);
  expect(() => readPadsContainer(change(10 + 10 * 16, 1))).toThrow(/记录尺寸/);
  expect(() => readPadsContainer(change(14 + 41 * 16, 1))).toThrow(/分页目录/);
  expect(() => readPadsContainer(change(14 + 4 * 16, 0xffffffff))).toThrow(
    /超出数据区/,
  );
  const b = empty();
  new Uint8Array(b)[b.byteLength - 42] = 0;
  expect(() => readPadsContainer(b)).toThrow(/GUID/);
});
