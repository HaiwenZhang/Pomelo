import { test, expect } from "vitest";

import type { BrdHeader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";

function createRecord(byteLength: number, version = 174, constraintEnd = 0) {
  const buffer = new ArrayBuffer(byteLength + 4);
  const view = new DataView(buffer);
  view.setUint32(byteLength, 0xfeedcafe, true);
  const reader = new Reader(buffer);
  reader.skip(1);
  const header = { version, constraintEnd } as BrdHeader;
  return { reader, view, records: new AllegroRecordReader(reader, header) };
}

test("field subtypes preserve scalar, array and skipped payload boundaries", () => {
  const payloads = [
    { subtype: 0x65, size: 8, words: [], expected: {} },
    { subtype: 0x64, size: 4, words: [123], expected: { Value: 123 } },
    {
      subtype: 0x69,
      size: 8,
      words: [123, 456],
      expected: { Value: [123, 456] },
    },
    { subtype: 0x6c, size: 0, words: [2, 123, 456], expected: {} },
    {
      subtype: 0x72,
      size: 56,
      words: [2, 123, 456],
      expected: { Words: [123, 456] },
    },
    // The low half-word is a word count; the high half-word is a byte count.
    { subtype: 0x70, size: 0, words: [0x00040001, 123, 456], expected: {} },
    { subtype: 0x74, size: 0, words: [0x00040001, 123, 456], expected: {} },
    { subtype: 0xf6, size: 0, words: Array(20).fill(123), expected: {} },
    { subtype: 0xff, size: 4, words: [123], expected: { Value: [123] } },
  ];
  for (const version of [166, 174]) {
    const payloadOffset = version === 166 ? 16 : 24;
    const subtypeOffset = version === 166 ? 12 : 16;
    for (const { subtype, size, words, expected } of payloads) {
      const byteLength = payloadOffset + words.length * 4;
      const { reader, view, records } = createRecord(byteLength, version);
      view.setUint8(subtypeOffset, subtype);
      view.setUint16(subtypeOffset + 2, size, true);
      words.forEach((word, index) =>
        view.setUint32(payloadOffset + index * 4, word, true),
      );
      const record = records.read(0x03);
      expect(record.Value).toStrictEqual(
        "Value" in expected ? expected.Value : undefined,
      );
      expect(record.Words).toStrictEqual(
        "Words" in expected ? expected.Words : undefined,
      );
      expect(reader.offset).toBe(byteLength);
      expect(reader.u32()).toBe(0xfeedcafe);
    }
  }
});

test("variable field and table readers reject invalid counts before consuming payloads", () => {
  const field = createRecord(32);
  field.view.setUint8(16, 0x72);
  field.view.setUint32(24, 1_000_001, true);
  expect(() => field.records.read(0x03)).toThrow(/字段数组过大/);
  expect(field.reader.offset).toBe(28);

  const references = createRecord(20);
  references.view.setUint32(12, 1_000_001, true);
  expect(() => references.records.read(0x3c)).toThrow(/引用列表过大/);
  expect(references.reader.offset).toBe(16);

  const definitions = createRecord(36);
  definitions.view.setUint16(2, 8, true);
  definitions.view.setUint32(16, 1, true);
  definitions.view.setUint32(20, 2, true);
  expect(() => definitions.records.read(0x36)).toThrow(/无效定义表容量/);
  expect(definitions.reader.offset).toBe(36);
});

test("constraint records use the declared region endpoint and reject backward or out-of-buffer endpoints", () => {
  const valid = createRecord(32, 174, 33);
  expect(valid.records.read(0x27)).toStrictEqual({});
  expect(valid.reader.offset).toBe(32);
  expect(valid.reader.u32()).toBe(0xfeedcafe);
  const backward = createRecord(32, 174, 1);
  expect(() => backward.records.read(0x27)).toThrow(/约束块终点无效/);
  expect(backward.reader.offset).toBe(1);
  const beyondBuffer = createRecord(32, 174, 100);
  expect(() => beyondBuffer.records.read(0x27)).toThrow(/无效 BRD 偏移/);
});

test("padstack dimension arrays retain their version-specific stride and trailer", () => {
  for (const { version, byteLength } of [
    { version: 160, byteLength: 512 },
    { version: 162, byteLength: 592 },
    { version: 172, byteLength: 596 },
    { version: 175, byteLength: 804 },
  ]) {
    const { reader, view, records } = createRecord(byteLength, version);
    view.setUint32(4, 123, true);
    view.setUint32(8, 456, true);
    view.setUint16(26, 2, true);
    expect(records.read(0x1f)).toStrictEqual({ Key: 123, Next: 456 });
    expect(reader.offset).toBe(byteLength);
    expect(reader.u32()).toBe(0xfeedcafe);
  }
});

test("legacy layer lists read inline names before the trailing record key", () => {
  const { reader, view, records } = createRecord(80, 164);
  view.setUint16(2, 2, true);
  view.setUint32(4, 0x504f54, true); // TOP
  view.setUint32(40, 0x444e47, true); // GND
  view.setUint32(76, 123, true);
  expect(records.read(0x2a)).toStrictEqual({
    NumEntries: 2,
    Entries: [{ Name: "TOP" }, { Name: "GND" }],
    Key: 123,
  });
  expect(reader.offset).toBe(80);
  expect(reader.u32()).toBe(0xfeedcafe);
});
