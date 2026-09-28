import { test, expect } from "vitest";

import { AllegroHeaderReader } from "../../src/lib/allegro/binary/header";

// Absolute positions from the file layouts, independent of the reader's cursor arithmetic.
const headerSamples = [
  {
    magic: 0x131003,
    version: 165,
    writer: 0xf8,
    units: 0x180,
    constraint: 0x18c,
    strings: 0x194,
    divisor: 0x26c,
    text: 0x8c,
    graphics: 0x5c,
  },
  {
    magic: 0x150002,
    version: 180,
    writer: 0x124,
    units: 0x18c,
    constraint: 0x28,
    strings: 0x34,
    divisor: 0x26c,
    text: 0xb4,
    graphics: 0x84,
  },
  {
    magic: 0x150203,
    version: 181,
    writer: 0x144,
    units: 0x1ac,
    constraint: 0x28,
    strings: 0x34,
    divisor: 0x28c,
    text: 0xb4,
    graphics: 0x84,
  },
];

function createHeader(sample: (typeof headerSamples)[number]) {
  const buffer = new ArrayBuffer(0x4f0);
  const view = new DataView(buffer);
  view.setUint32(0, sample.magic, true);
  view.setUint32(sample.divisor, 1000, true);
  return { buffer, view };
}

for (const sample of headerSamples) {
  test(`V${sample.version} reads relocated fields, ordered list endpoints and all layer entries`, () => {
    const { buffer, view } = createHeader(sample);
    view.setUint32(0x14, 123, true);
    view.setUint32(sample.constraint, 0x12345678, true);
    view.setUint32(sample.strings, 456, true);
    view.setUint8(sample.units, 5);
    new Uint8Array(buffer).set(
      new TextEncoder().encode("source writer\0ignored suffix"),
      sample.writer,
    );
    const textList = { head: 0x81234567, tail: 0x92345678 };
    const graphicList = { head: 0xa3456789, tail: 0xb456789a };
    for (const [offset, list] of [
      [sample.text, textList],
      [sample.graphics, graphicList],
    ] as const) {
      view.setUint32(
        offset,
        sample.version < 180 ? list.tail : list.head,
        true,
      );
      view.setUint32(
        offset + 4,
        sample.version < 180 ? list.head : list.tail,
        true,
      );
    }
    const layerMap = Array.from({ length: 25 }, (_, index) => ({
      classId: index + 10,
      recordId: 0xf0000000 + index,
    }));
    layerMap.forEach((entry, index) => {
      view.setUint32(0x428 + index * 8, entry.classId, true);
      view.setUint32(0x42c + index * 8, entry.recordId, true);
    });

    expect(new AllegroHeaderReader(buffer).read()).toStrictEqual({
      magic: sample.magic,
      version: sample.version,
      writerVersion: "source writer",
      objectCount: 123,
      units: 5,
      divisor: 1000,
      stringCount: 456,
      constraintEnd: 0x12345678,
      layerMap,
      textList,
      graphicList,
      sentinelKeys:
        sample.version < 180 ? [] : [graphicList.tail, textList.tail],
    });
  });
}

test("format families ignore the low magic byte while preserving the complete source magic", () => {
  for (const [magicFamily, version] of [
    [0x130000, 160],
    [0x130400, 162],
    [0x130c00, 164],
    [0x131000, 165],
    [0x131500, 166],
    [0x140400, 172],
    [0x140500, 172],
    [0x140600, 172],
    [0x140700, 172],
    [0x140900, 174],
    [0x140e00, 174],
    [0x141400, 175],
    [0x141500, 175],
    [0x150000, 180],
    [0x150200, 181],
  ]) {
    for (const revision of [0, 3, 0xff]) {
      const sample = headerSamples[version < 180 ? 0 : version === 180 ? 1 : 2];
      const { buffer, view } = createHeader(sample);
      const magic = magicFamily | revision;
      view.setUint32(0, magic, true);
      const header = new AllegroHeaderReader(buffer).read();
      expect(header.magic).toBe(magic);
      expect(header.version).toBe(version);
    }
  }
});

test("modern list sentinels exclude zero and duplicate tails while preserving source order", () => {
  const { buffer, view } = createHeader(headerSamples[2]);
  for (const [index, tail] of [
    [0, 0xf0000001],
    [1, 17],
    [3, 0xf0000001],
    [26, 17],
    [27, 23],
  ]) {
    view.setUint32(0x40 + index * 8, tail, true);
  }
  expect(new AllegroHeaderReader(buffer).read().sentinelKeys).toStrictEqual([
    0xf0000001, 17, 23,
  ]);
});

test("headers reject zero divisors, unsupported families and every truncated prefix", () => {
  for (const sample of headerSamples) {
    const { buffer, view } = createHeader(sample);
    for (let length = 0; length < buffer.byteLength; length++) {
      expect(() =>
        new AllegroHeaderReader(buffer.slice(0, length)).read(),
      ).toThrow(/exceeds the file|offset/);
    }
    view.setUint32(sample.divisor, 0, true);
    expect(() => new AllegroHeaderReader(buffer).read()).toThrow(
      /Invalid BRD unit divisor/,
    );
    view.setUint32(0, 0x141302, true);
    expect(() => new AllegroHeaderReader(buffer).read()).toThrow(
      /Unsupported BRD format/,
    );
  }
});
