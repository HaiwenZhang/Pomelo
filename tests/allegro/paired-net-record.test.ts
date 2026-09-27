import { test, expect } from "vitest";

import type { BrdHeader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";

const header: BrdHeader = {
  magic: 0,
  version: 172,
  writerVersion: "",
  objectCount: 0,
  units: 3,
  divisor: 10000,
  stringCount: 0,
  layerMap: [],
  constraintEnd: 0,
  textList: { head: 0, tail: 0 },
};
for (const version of [172, 174])
  test(`V${version} paired-net metadata preserves both members and its successor`, () => {
    const length = version === 172 ? 88 : 92,
      b = new ArrayBuffer(length + 8),
      v = new DataView(b),
      r = new Reader(b);
    v.setUint8(0, 0x1a);
    v.setUint32(4, 66537, true);
    const start = version === 172 ? 8 : 12,
      words = [
        14480, 117600, 0, 0, 0, 0, 1943, 224443, 225857, 225948, 14518, 0, 0, 0,
        0, 0, 2516, 214055, 214055, 214473,
      ];
    words.forEach((w, i) => v.setUint32(start + i * 4, w, true));
    v.setUint32(length, 0x0d0f0028, true);
    v.setUint32(length + 4, 66538, true);
    r.skip(1);
    const d = new AllegroRecordReader(r, { ...header, version }).read(0x1a);
    expect(d.Key).toBe(66537);
    expect(d.Unknown).toBe(version === 174 ? 0 : undefined);
    expect(d.Members).toStrictEqual([
      { Net: 14480, Next: 117600, Metadata: words.slice(2, 10) },
      { Net: 14518, Next: 0, Metadata: words.slice(12, 20) },
    ]);
    expect(r.offset).toBe(length);
    expect(r.u32()).toBe(0x0d0f0028);
    expect(r.u32()).toBe(66538);
    const short = new Reader(b.slice(0, length - 1));
    short.skip(1);
    expect(() =>
      new AllegroRecordReader(short, { ...header, version }).read(0x1a),
    ).toThrow(/越界/);
  });
test("unverified paired-net layouts fail explicitly", () => {
  for (const version of [160, 166, 175, 180, 181])
    expect(() =>
      new AllegroRecordReader(new Reader(new ArrayBuffer(128)), {
        ...header,
        version,
      }).read(0x1a),
    ).toThrow(/尚未验证/);
});
