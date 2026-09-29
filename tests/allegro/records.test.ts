import { test, expect } from "vitest";

import type { BrdHeader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";

const header: BrdHeader = {
  magic: 0x140900,
  version: 174,
  writerVersion: "",
  objectCount: 0,
  units: 1,
  divisor: 100,
  stringCount: 0,
  layerMap: [],
  constraintEnd: 0,
  textList: { head: 0, tail: 0 },
};
function record(bytes: number, type: number) {
  const b = new ArrayBuffer(bytes);
  new Uint8Array(b)[0] = type;
  const r = new Reader(b);
  r.skip(1);
  return { b, r, v: new DataView(b) };
}

for (const version of [160, 162, 164, 165, 166, 172, 174, 175, 180, 181])
  test(`${version} footprint resolves its component link without shifting placement or the following record`, () => {
    for (const reference of [0, 2147691128]) {
      const legacy = version < 172,
        end = legacy ? 64 : 72,
        { r, v } = record(end + 4, 0x2d);
      v.setUint32(4, 2148023600, true);
      v.setUint32(8, 2148023664, true);
      // PG43's independent source fields (15061, record offset 979428).
      v.setUint32(legacy ? 12 : 40, reference, true);
      if (!legacy) {
        v.setUint32(12, 0xaabbccdd, true);
        v.setUint32(20, 0x11223344, true);
      }
      v.setUint32(legacy ? 24 : 28, 270000, true);
      v.setInt32(legacy ? 28 : 32, 1592100, true);
      v.setInt32(legacy ? 32 : 36, 87900, true);
      v.setUint32(legacy ? 40 : 48, 2167870152, true);
      v.setUint32(end, 0xfeedcafe, true);
      const d = new AllegroRecordReader(r, { ...header, version }).read(0x2d);
      expect(d.Key).toBe(2148023600);
      expect(d.Next).toBe(2148023664);
      expect(d.InstRef).toBe(reference);
      expect(d.InstRef16x).toBe(legacy ? reference : undefined);
      expect(d.Rotation).toBe(270000);
      expect(d.CoordX).toBe(1592100);
      expect(d.CoordY).toBe(87900);
      expect(d.FirstPadPtr).toBe(2167870152);
      expect(r.offset).toBe(end);
      expect(r.u32()).toBe(0xfeedcafe);
    }
  });
test("version-conditional reference field remains a scalar", () => {
  const { r, v } = record(24, 4);
  v.setUint32(4, 123, true);
  v.setUint32(20, 77, true);
  const d = new AllegroRecordReader(r, header).read(4);
  expect(d.Key).toBe(123);
  expect(d.Unknown).toBe(77);
  expect(r.offset).toBe(24);
});
test("17.4 definition slots do not consume the 17.5 trailing word", () => {
  const { r, v } = record(64, 0x36);
  v.setUint16(2, 5, true);
  v.setUint32(16, 1, true);
  v.setUint32(20, 1, true);
  new AllegroRecordReader(r, header).read(0x36);
  expect(r.offset).toBe(64);
});
test("17.5 definition slots consume their extra word", () => {
  const { r, v } = record(68, 0x36);
  v.setUint16(2, 5, true);
  v.setUint32(16, 1, true);
  v.setUint32(20, 1, true);
  new AllegroRecordReader(r, { ...header, version: 175 }).read(0x36);
  expect(r.offset).toBe(68);
});
test("malformed blob and unknown records fail rather than scanning ahead", () => {
  const { r, v } = record(12, 0x21);
  v.setUint32(4, 8, true);
  expect(() => new AllegroRecordReader(r, header).read(0x21)).toThrow(
    /blob length/,
  );
  expect(() =>
    new AllegroRecordReader(new Reader(new ArrayBuffer(16)), header).read(0xff),
  ).toThrow(/Unknown BRD record/);
});

for (const version of [160, 162, 164, 166, 172, 174])
  test(`${version} SI model retains the following record for empty and populated payloads`, () => {
    for (const payload of ["", "IBIS"]) {
      const bytes = new TextEncoder().encode(payload),
        head = version >= 162 ? 24 : 20,
        padded = Math.ceil(bytes.length / 4) * 4,
        end = head + padded + (version >= 172 ? 4 : 0);
      const { r, v, b } = record(end + 8, 0x1e);
      v.setUint32(4, 537297032, true);
      v.setUint32(8, 537297056, true);
      if (version >= 162) {
        v.setUint16(12, 83, true);
        v.setUint16(14, 768, true);
      }
      v.setUint32(head - 8, 541034424, true);
      v.setUint32(head - 4, bytes.length, true);
      new Uint8Array(b).set(bytes, head);
      if (version >= 172) v.setUint32(end - 4, 987, true);
      v.setUint32(end, 0x0001001f, true);
      v.setUint32(end + 4, 537297056, true);
      const d = new AllegroRecordReader(r, { ...header, version }).read(0x1e);
      expect(d.Next).toBe(537297056);
      expect(d.StrPtr).toBe(541034424);
      expect(d.String).toBe(payload);
      expect(d.Size).toBe(bytes.length);
      expect(d.Unknown2).toBe(version >= 162 ? 83 : undefined);
      expect(d.Unknown4).toBe(version >= 172 ? 987 : undefined);
      expect(r.offset).toBe(end);
      expect(r.u32()).toBe(0x0001001f);
      expect(r.u32()).toBe(d.Next);
    }
  });
test("variable layer entries retain name references and properties", () => {
  const { r, v } = record(24, 0x2a);
  v.setUint16(2, 1, true);
  v.setUint32(8, 321, true);
  v.setUint32(12, 5, true);
  v.setUint32(20, 999, true);
  const d = new AllegroRecordReader(r, header).read(0x2a);
  expect(d.Key).toBe(999);
  expect(d.Entries).toStrictEqual([{ NameId: 321, Properties: 5, Unknown: 0 }]);
});

test("17.x padstack retains slot envelope, plating flags and custom shape reference", () => {
  const { r, v } = record(192 + 36 * 29, 0x1c);
  v.setUint8(30, 0x20);
  v.setUint16(44, 2, true);
  v.setUint32(64, 2800, true);
  v.setUint32(76, 2800, true);
  v.setUint32(80, 7900, true);
  const component = 192 + 23 * 36;
  v.setUint8(component, 22);
  v.setInt32(component + 8, 4700, true);
  v.setInt32(component + 12, 9800, true);
  v.setUint32(component + 32, 1234, true);
  const d = new AllegroRecordReader(r, header).read(0x1c);
  expect(d.DrillSize).toBe(2800);
  expect(d.SlotX).toBe(2800);
  expect(d.SlotY).toBe(7900);
  expect(d.Flags).toBe(0x20);
  expect(d.Components[23].ShapePtr).toBe(1234);
  expect(r.offset).toBe(192 + 36 * 29);
});

// Independent source readings at record-relative offset 108. Negative values
// are retained bit-for-bit; this test does not infer a display/machining rule.
for (const sample of [
  {
    name: "AGILEX 38017",
    version: 174,
    drill: 600,
    words: [1600, 0, 0, 2000, 2000, 2, 65],
  },
  {
    name: "S5000 65130",
    version: 174,
    drill: 10000,
    words: [4294947296, 0, 0, 10000, 10000, 5, 0],
  },
  {
    name: "S5000 65131",
    version: 174,
    drill: 8000,
    words: [4294949296, 0, 0, 8000, 8000, 4, 0],
  },
  {
    name: "874 51424",
    version: 180,
    drill: 2540,
    words: [
      0, 0, 0, 2540, 2540, 2, 12337, 4294963232, 0, 0, 2540, 2540, 2, 12337,
    ],
  },
  {
    name: "874 51778",
    version: 180,
    drill: 2000,
    words: [
      0, 0, 0, 2000, 2000, 2, 4278082, 4294963772, 0, 0, 2000, 2000, 2, 4278082,
    ],
  },
])
  test(`${sample.name} retains extended drill words without shifting pad components or the next record`, () => {
    const head = sample.version >= 180 ? 224 : 192,
      end = head + 25 * 36 + 40;
    const { r, v } = record(end + 4, 0x1c);
    v.setUint8(2, 1);
    v.setUint16(44, 1, true);
    v.setUint32(64, sample.drill, true);
    const expected = Array.from(
      { length: sample.version >= 180 ? 29 : 21 },
      (_, i) => sample.words[i] ?? 0,
    );
    expected.forEach((word, i) => v.setUint32(108 + i * 4, word, true));
    v.setUint8(head + 23 * 36, 2);
    v.setInt32(head + 23 * 36 + 8, 12345, true);
    v.setUint32(end, 0xfeedcafe, true);
    const d = new AllegroRecordReader(r, {
      ...header,
      version: sample.version,
    }).read(0x1c);
    expect(d.DrillMetadataWords).toStrictEqual(expected);
    expect(d.DrillSize).toBe(sample.drill);
    expect(d.Components[23].Type).toBe(2);
    expect(d.Components[23].W).toBe(12345);
    expect(r.offset).toBe(end);
    expect(r.u32()).toBe(0xfeedcafe);
  });

for (const version of [160, 162, 164, 165, 166])
  test(`${version} padstack reads final component and trailer without consuming the next record`, () => {
    const fixed = version < 165 ? 10 : 11,
      head = version < 165 ? 84 : 88,
      count = fixed + 6,
      end = head + count * 28 - 4 + 32;
    const { r, v } = record(end + 4, 0x1c);
    v.setUint8(2, 1);
    v.setUint8(3, 2);
    v.setUint32(4, 123, true);
    v.setUint32(16, 300, true);
    v.setUint8(41, 1);
    v.setUint16(50, 2, true);
    v.setUint32(72, 400, true);
    v.setUint32(76, 900, true);
    const pad = head + (fixed + 2) * 28;
    v.setUint8(pad, 22);
    v.setInt32(pad + 4, 400, true);
    v.setInt32(pad + 8, 900, true);
    v.setInt32(pad + 12, -100, true);
    v.setUint32(pad + 20, 567, true);
    const last = head + (count - 1) * 28;
    v.setUint8(last, 6);
    v.setUint32(last + 20, 789, true);
    v.setUint32(end, 0xfeedcafe, true);
    const d = new AllegroRecordReader(r, { ...header, version }).read(0x1c);
    expect(d.Key).toBe(123);
    expect(d.StartLayer).toBe(2);
    expect(d.LayerCount).toBe(2);
    expect(d.Plated).toBe(true);
    expect(d.NumFixedCompEntries).toBe(fixed);
    expect(d.NumCompsPerLayer).toBe(3);
    expect(d.Components[fixed + 2].ShapePtr).toBe(567);
    expect(d.Components[fixed + 2].OffsetX).toBe(-100);
    expect(d.Components[fixed + 2].Z1).toBe(0);
    expect(d.Components.at(-1)!.ShapePtr).toBe(789);
    expect(d.DrillSize).toBe(300);
    expect(d.SlotY).toBe(900);
    expect(r.offset).toBe(end);
    expect(r.u32()).toBe(0xfeedcafe);
  });
