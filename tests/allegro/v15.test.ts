import { expect, test } from "vitest";
import {
  AllegroHeaderReader,
  type BrdHeader,
} from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";
import { AllegroParser } from "../../src/lib/allegro/parser";

const header = { version: 152 } as BrdHeader;
function record(type: number, size: number) {
  const buffer = new ArrayBuffer(size + 4),
    view = new DataView(buffer);
  view.setUint16(0, (type << 10) | 0x201, true);
  view.setUint32(4, 0x81234567, true);
  view.setUint32(size, 0xfeedcafe, true);
  return { buffer, view };
}
function decode(buffer: ArrayBuffer, version = 152) {
  const reader = new Reader(buffer);
  const type = reader.recordType(version);
  const value = new AllegroRecordReader(reader, { ...header, version }).read(
    type,
  );
  return { reader, value };
}

test.each([
  [0x120505, 152],
  [0x120506, 152],
  [0x120f0c, 157],
])(
  "15.x magic %s preserves the source release and reads the relocated layer map",
  (magic, version) => {
    const buffer = new ArrayBuffer(0x1200),
      view = new DataView(buffer);
    view.setUint32(0, magic, true);
    view.setUint32(0x26c, 1000, true);
    view.setUint32(0x4a4, 0xabcdef01, true);
    new Uint8Array(buffer).set(new TextEncoder().encode("allv15-source"), 0xf8);
    const h = new AllegroHeaderReader(buffer).read();
    expect(h).toMatchObject({ magic, version, writerVersion: "allv15-source" });
    expect(h.layerMap[6].recordId).toBe(0xabcdef01);
  },
);

test("packed record tags preserve all ten flags without changing source bytes", () => {
  const { buffer } = record(0x32, 72),
    original = buffer.slice(0);
  const r = new Reader(buffer);
  expect(r.recordType(152)).toBe(0x32);
  expect(r.u8()).toBe(0x201);
  expect(r.u16()).toBe(0);
  expect(buffer).toEqual(original);
  r.seek(0);
  expect(r.recordType(174)).toBe(1);
  expect(r.u8()).toBe(0xca);
  expect(() => new Reader(new ArrayBuffer(1)).recordType(152)).toThrow();
});

// Observed on-disk sizes, independent of the layout functions and scan fast paths.
test.each([
  [1, 68],
  [5, 48],
  [6, 36],
  [7, 64],
  [8, 52],
  [9, 36],
  [0x0a, 64],
  [0x0c, 48],
  [0x0d, 68],
  [0x0e, 56],
  [0x0f, 84],
  [0x10, 56],
  [0x11, 52],
  [0x14, 28],
  [0x15, 40],
  [0x16, 40],
  [0x17, 40],
  [0x1a, 88],
  [0x1b, 52],
  [0x23, 64],
  [0x28, 64],
  [0x2c, 28],
  [0x2d, 60],
  [0x30, 40],
  [0x32, 72],
  [0x33, 68],
  [0x34, 28],
])("15.x record %s keeps the next record intact", (type, size) => {
  const { buffer } = record(type, size);
  for (const version of [152, 157]) {
    const { reader, value } = decode(buffer, version);
    expect(value.Key).toBe(0x81234567);
    expect(reader.offset).toBe(size);
    expect(reader.u32()).toBe(0xfeedcafe);
    const scan = new Reader(buffer);
    expect(scan.recordType(version)).toBe(type);
    expect(
      new AllegroRecordReader(scan, { ...header, version }).scanKey(type),
    ).toBe(value.Key);
    expect(scan.offset).toBe(size);
    expect(() => decode(buffer.slice(0, size - 1), version)).toThrow();
  }
});

test.each([
  [7, "RefDes"],
  [0x0d, "Name"],
  [8, "Number"],
  [0x11, "PinName"],
])(
  "15.x inline name on record %s does not consume the following pointer",
  (type, field) => {
    const size = type === 7 ? 64 : type === 0x0d ? 68 : 52;
    const { buffer, view } = record(Number(type), size);
    new Uint8Array(buffer).set(new TextEncoder().encode("U15.A1"), 8);
    view.setUint32(40, 0xaabbccdd, true);
    const { value } = decode(buffer);
    expect(value[field]).toBe("U15.A1");
    expect(value.Next).toBe(0xaabbccdd);
  },
);

test("15.x line width, integer arc centers and text rotation use their own field order", () => {
  const line = record(0x15, 40);
  line.view.setUint32(16, 250, true);
  line.view.setUint32(20, 0x40, true);
  line.view.setInt32(24, -2000, true);
  expect(decode(line.buffer).value).toMatchObject({
    Width: 250,
    Flags: 0x40,
    StartX: -2000,
  });
  const arc = record(1, 68);
  arc.view.setUint32(16, 125, true);
  arc.view.setInt32(40, -1234, true);
  arc.view.setInt32(44, 5678, true);
  arc.view.setInt32(48, 4000, true);
  expect(decode(arc.buffer).value).toMatchObject({
    Width: 125,
    CenterX: -1234,
    CenterY: 5678,
    Radius: 4000,
  });
  const text = record(0x30, 40);
  text.view.setUint32(12, 0xfdaf00, true);
  text.view.setUint32(16, 90000, true);
  text.view.setUint32(20, 0x30009, true);
  text.view.setUint32(32, 100, true);
  expect(decode(text.buffer).value).toMatchObject({
    Rotation: 90000,
    Font16x: 0x30009,
    StrGraphicPtr: 100,
  });
});

test.each([
  [4, 20],
  [5, 16],
  [11, 254],
])(
  "15.x definition table %s scans its capacity and resumes at a real record",
  async (code, stride) => {
    const size = 28 + 2 * stride;
    const buffer = new ArrayBuffer(0x1200 + size + 28),
      view = new DataView(buffer);
    view.setUint32(0, 0x120506, true);
    view.setUint32(0x26c, 1000, true);
    view.setUint16(0x1200, 0x36 << 10, true);
    view.setUint16(0x1202, code, true);
    view.setUint32(0x1204, 101, true);
    view.setUint32(0x120c, 2, true);
    view.setUint32(0x1210, 1, true);
    view.setUint16(0x1200 + size, (0x14 << 10) | 0x200, true);
    view.setUint32(0x1204 + size, 102, true);
    const db = await new AllegroParser(buffer).parse();
    expect(db.count).toBe(2);
    expect(db.get(101)).toMatchObject({ Code: code, NumItems: 2, Count: 1 });
    expect(db.get(102)).toMatchObject({ type: 0x14, Type: 0x200 });
    expect(db.endOffset).toBe(buffer.byteLength);
  },
);

test("15.x variable constraint and dimension records honor counts and bounds", () => {
  const constraint = record(0x1d, 32 + 2 * 256 + 3 * 136);
  constraint.view.setUint16(16, 2, true);
  constraint.view.setUint16(18, 3, true);
  const dimensions = record(0x1f, 68 + 2 * 500);
  dimensions.view.setUint16(58, 2, true);
  for (const { buffer } of [constraint, dimensions]) {
    const { reader } = decode(buffer);
    expect(reader.u32()).toBe(0xfeedcafe);
    expect(() => decode(buffer.slice(0, buffer.byteLength - 5))).toThrow();
  }
});

test.each([0, 1])(
  "15.x restricted-layer flag %s trims only marked padstacks",
  (flag) => {
    const count = 10 + 3 * 4,
      size = 84 + count * 28 - 4;
    const { buffer, view } = record(0x1c, size);
    view.setUint16(44, flag, true);
    view.setUint16(50, 4, true);
    // One populated pad on board layer 2; empty outer layers remain stored.
    view.setUint8(84 + (10 + 3 * 2 + 2) * 28, 2);
    view.setUint32(84 + (10 + 3 * 2 + 2) * 28 + 4, 500, true);
    const { reader, value } = decode(buffer);
    expect(reader.offset).toBe(size);
    expect(value.StartLayer).toBe(flag ? 2 : 0);
    expect(value.LayerCount).toBe(flag ? 1 : 4);
    expect(value.Components[flag ? 12 : 18].W).toBe(500);
  },
);
