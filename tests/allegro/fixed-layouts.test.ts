import { test, expect } from "vitest";

import { AllegroFixedLayoutReader } from "../../src/lib/allegro/binary/layouts";
import { Reader } from "../../src/lib/allegro/binary/reader";

function createRecord(recordType: number, byteLength: number) {
  const buffer = new ArrayBuffer(byteLength + 4);
  const view = new DataView(buffer);
  view.setUint8(0, recordType);
  view.setUint32(byteLength, 0xfeedcafe, true);
  const reader = new Reader(buffer);
  reader.skip(1);
  return { reader, view };
}

test("arc layouts preserve signed coordinates, Allegro floats and the next record", () => {
  for (const { version, byteLength, startOffset, centerOffset } of [
    { version: 166, byteLength: 80, startOffset: 24, centerOffset: 40 },
    { version: 172, byteLength: 84, startOffset: 28, centerOffset: 44 },
  ]) {
    const { reader, view } = createRecord(0x01, byteLength);
    view.setInt32(startOffset, -12345, true);
    view.setInt32(startOffset + 4, 67890, true);
    // Allegro stores the high 32-bit word first, with each word little-endian.
    view.setUint32(centerOffset, 0x3ff80000, true); // 1.5
    view.setUint32(centerOffset + 8, 0xc0040000, true); // -2.5
    view.setUint32(centerOffset + 16, 0x400c0000, true); // 3.5
    const record = new AllegroFixedLayoutReader(reader, version).read(0x01);
    expect(record?.StartX).toBe(-12345);
    expect(record?.StartY).toBe(67890);
    expect(record?.CenterX).toBe(1.5);
    expect(record?.CenterY).toBe(-2.5);
    expect(record?.Radius).toBe(3.5);
    expect(reader.offset).toBe(byteLength);
    expect(reader.u32()).toBe(0xfeedcafe);
  }
});

test("pin definitions retain version-specific drill fields and record boundaries", () => {
  for (const { version, byteLength, coordinateOffset, hasTrailingWord } of [
    {
      version: 166,
      byteLength: 56,
      coordinateOffset: 28,
      hasTrailingWord: false,
    },
    {
      version: 172,
      byteLength: 64,
      coordinateOffset: 36,
      hasTrailingWord: false,
    },
    {
      version: 174,
      byteLength: 68,
      coordinateOffset: 36,
      hasTrailingWord: true,
    },
    {
      version: 180,
      byteLength: 68,
      coordinateOffset: 40,
      hasTrailingWord: false,
    },
  ]) {
    const { reader, view } = createRecord(0x0c, byteLength);
    view.setUint32(20, 0x12345678, true);
    view.setInt32(coordinateOffset, -456, true);
    view.setInt32(coordinateOffset + 4, 789, true);
    if (hasTrailingWord) view.setUint32(byteLength - 4, 987, true);
    const record = new AllegroFixedLayoutReader(reader, version).read(0x0c);
    expect(record?.Coords).toStrictEqual([-456, 789]);
    expect(record?.Shape).toBe(version < 172 ? 0x78 : undefined);
    expect(record?.DrillChar).toBe(version < 172 ? 0x56 : undefined);
    expect(record?.Shape16x).toBe(version >= 172 ? 0x12345678 : undefined);
    expect(record?.Unknown8).toBe(hasTrailingWord ? 987 : undefined);
    expect(reader.offset).toBe(byteLength);
    expect(reader.u32()).toBe(0xfeedcafe);
  }
});

test("film records switch from inline names to string references at version 166", () => {
  for (const { version, byteLength } of [
    { version: 165, byteLength: 64 },
    { version: 166, byteLength: 52 },
    { version: 174, byteLength: 56 },
  ]) {
    const { reader, view } = createRecord(0x38, byteLength);
    view.setUint32(16, 0x504f54, true); // "TOP" followed by NUL.
    const record = new AllegroFixedLayoutReader(reader, version).read(0x38);
    expect(record?.FilmName).toBe(version < 166 ? "TOP" : undefined);
    expect(record?.LayerNameStr).toBe(version >= 166 ? 0x504f54 : undefined);
    expect(reader.offset).toBe(byteLength);
    expect(reader.u32()).toBe(0xfeedcafe);
  }
});

test("function slots replace the legacy payload with a device reference at version 190", () => {
  for (const { version, byteLength, deviceReferenceOffset } of [
    { version: 166, byteLength: 56, deviceReferenceOffset: undefined },
    { version: 172, byteLength: 60, deviceReferenceOffset: undefined },
    { version: 174, byteLength: 64, deviceReferenceOffset: undefined },
    { version: 190, byteLength: 36, deviceReferenceOffset: 16 },
  ]) {
    const { reader, view } = createRecord(0x0f, byteLength);
    if (deviceReferenceOffset !== undefined)
      view.setUint32(deviceReferenceOffset, 123, true);
    view.setUint32(byteLength - 12, 456, true);
    const record = new AllegroFixedLayoutReader(reader, version).read(0x0f);
    expect(record?.CompDeviceTypePtr).toBe(version >= 190 ? 123 : undefined);
    expect(record?.Ptr0x06).toBe(456);
    expect(reader.offset).toBe(byteLength);
    expect(reader.u32()).toBe(0xfeedcafe);
  }
});

test("pointer arrays consume all 100 slots even when only one entry is used", () => {
  for (const { version, byteLength, entriesOffset } of [
    { version: 172, byteLength: 428, entriesOffset: 28 },
    { version: 174, byteLength: 432, entriesOffset: 32 },
  ]) {
    const { reader, view } = createRecord(0x37, byteLength);
    view.setUint32(16, 100, true);
    view.setUint32(20, 1, true);
    view.setUint32(entriesOffset, 123, true);
    view.setUint32(byteLength - 4, 456, true);
    const record = new AllegroFixedLayoutReader(reader, version).read(0x37);
    expect(record?.Count).toBe(1);
    expect(record?.Ptrs.length).toBe(100);
    expect(record?.Ptrs[0]).toBe(123);
    expect(record?.Ptrs[99]).toBe(456);
    expect(reader.offset).toBe(byteLength);
    expect(reader.u32()).toBe(0xfeedcafe);

    const truncated = new Reader(view.buffer.slice(0, byteLength - 1));
    truncated.skip(1);
    expect(() =>
      new AllegroFixedLayoutReader(truncated, version).read(0x37),
    ).toThrow(/越界/);
  }
});

test("unsupported fixed layouts leave the cursor untouched for the caller", () => {
  const reader = new Reader(new ArrayBuffer(8));
  reader.skip(1);
  const layouts = new AllegroFixedLayoutReader(reader, 174);
  for (const recordType of [0, 0x03, 0x1c, 0x31, 0x3c, 0xff, -1]) {
    expect(layouts.read(recordType)).toBe(undefined);
    expect(reader.offset).toBe(1);
  }
});
