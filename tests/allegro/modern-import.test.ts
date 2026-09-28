import { test, expect, vi, onTestFinished } from "vitest";

import { AllegroHeaderReader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";
import { AllegroParser } from "../../src/lib/allegro/parser";

function file(version: 174 | 180 | 181, size = 0x1300) {
  const b = new ArrayBuffer(size),
    v = new DataView(b);
  v.setUint32(
    0,
    version === 174 ? 0x140900 : version === 180 ? 0x150000 : 0x150200,
    true,
  );
  v.setUint32(version === 181 ? 0x28c : 0x26c, 100, true);
  return { b, v };
}
function blob(v: DataView, offset: number, key: number) {
  v.setUint8(offset, 0x21);
  v.setUint32(offset + 4, 12, true);
  v.setUint32(offset + 8, key, true);
}
for (const version of [180, 181] as const)
  test(`format ${version} reads relocated header fields and list tails`, () => {
    const { b, v } = file(version),
      writer = version === 181 ? 0x144 : 0x124;
    v.setUint32(20, 123, true);
    v.setUint32(0x28, 456, true);
    v.setUint32(0x34, 2, true);
    for (let i = 0; i < 28; i++) {
      v.setUint32(0x3c + i * 8, 1000 + i, true);
      v.setUint32(0x40 + i * 8, 100 + i, true);
    }
    new Uint8Array(b).set(new TextEncoder().encode("fixture writer"), writer);
    v.setUint8(writer + 104, 5);
    v.setUint32(0x428 + 6 * 8, 1, true);
    v.setUint32(0x428 + 6 * 8 + 4, 987, true);
    const h = new AllegroHeaderReader(b).read();
    expect(h.version).toBe(version);
    expect(h.objectCount).toBe(123);
    expect(h.constraintEnd).toBe(456);
    expect(h.stringCount).toBe(2);
    expect(h.writerVersion).toBe("fixture writer");
    expect(h.units).toBe(5);
    expect(h.divisor).toBe(100);
    expect(h.textList).toStrictEqual({ head: 1015, tail: 115 });
    expect(h.sentinelKeys).toStrictEqual(
      Array.from({ length: 28 }, (_, i) => 100 + i),
    );
    expect(h.layerMap[6]).toStrictEqual({ classId: 1, recordId: 987 });
  });

test("modern record groups resume across aligned zero gaps; old formats stop", async () => {
  for (const version of [174, 180, 181] as const) {
    const { b, v } = file(version);
    blob(v, 0x1200, 500);
    blob(v, 0x1240, 600);
    const db = await new AllegroParser(b, undefined).parse();
    expect(db.count).toBe(version === 174 ? 1 : 2);
    expect(db.endOffset).toBe(version === 174 ? 0x120c : 0x124c);
    expect(db.get(600)?.type).toBe(version === 174 ? undefined : 0x21);
  }
});

test("duplicate BRD string IDs fail instead of replacing an earlier name", async () => {
  const { b, v } = file(174);
  v.setUint32(0x194, 2, true);
  v.setUint32(0x1200, 9, true);
  v.setUint8(0x1204, 65);
  v.setUint32(0x1208, 9, true);
  v.setUint8(0x120c, 66);
  await expect(new AllegroParser(b).parse()).rejects.toThrow(/重复.*字符串.*9/);
});
test("zero scanning stops at invalid or unaligned trailers and never skips unknown records", async () => {
  for (const [offset, type] of [
    [0x1241, 0x21],
    [0x1240, 0xff],
  ]) {
    const { b, v } = file(181);
    blob(v, 0x1200, 500);
    v.setUint8(offset, type);
    blob(v, 0x1260, 600);
    const db = await new AllegroParser(b, undefined).parse();
    expect(db.count).toBe(1);
    expect(db.endOffset).toBe(0x120c);
  }
  const { b, v } = file(181);
  blob(v, 0x1200, 500);
  v.setUint8(0x1240, 0x02);
  await expect(
    Promise.resolve().then(() => new AllegroParser(b, undefined).parse()),
  ).rejects.toThrow(/未知记录类型 0x2/);
});
test("large zero gaps yield progress and honor cancellation without publishing a database", async () => {
  let now = 0;
  const nowSpy = vi
    .spyOn(performance, "now")
    .mockImplementation(() => (now += 11));
  onTestFinished(() => nowSpy.mockRestore());
  const { b } = file(181, 32 * 1024 * 1024),
    controller = new AbortController();
  await expect(
    Promise.resolve().then(() =>
      new AllegroParser(b, undefined).parse(controller.signal, (p) => {
        if (p.phase === "objects" && p.fraction < 1) controller.abort();
      }),
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
});
test("field 0x72 uses count-prefixed words rather than its Size and enforces bounds", () => {
  const { b } = file(174),
    h = new AllegroHeaderReader(b).read(),
    payload = new ArrayBuffer(56),
    v = new DataView(payload);
  v.setUint8(0, 3);
  v.setUint32(4, 123, true);
  v.setUint8(16, 0x72);
  v.setUint16(18, 56, true);
  v.setUint32(24, 6, true);
  for (let i = 0; i < 6; i++) v.setUint32(28 + i * 4, 700 + i, true);
  v.setUint32(52, 0xfeedcafe, true);
  const r = new Reader(payload);
  r.skip(1);
  expect(new AllegroRecordReader(r, h).read(3).Words).toStrictEqual([
    700, 701, 702, 703, 704, 705,
  ]);
  expect(r.u32()).toBe(0xfeedcafe);
  v.setUint32(24, 8, true);
  r.seek(1);
  expect(() => new AllegroRecordReader(r, h).read(3)).toThrow(/越界/);
});
test("modern padstack and definition strides leave the next record intact", () => {
  const h = new AllegroHeaderReader(file(180).b).read(),
    count = 25,
    end = 224 + count * 36,
    b = new ArrayBuffer(end + 4),
    v = new DataView(b);
  v.setUint8(0, 0x1c);
  v.setUint16(44, 1, true);
  v.setUint8(224 + 23 * 36, 2);
  v.setInt32(224 + 23 * 36 + 8, 500, true);
  v.setUint32(end, 0xfeedcafe, true);
  const r = new Reader(b);
  r.skip(1);
  const stack = new AllegroRecordReader(r, h).read(0x1c);
  expect(stack.Components[23].W).toBe(500);
  expect(r.offset).toBe(end);
  expect(r.u32()).toBe(0xfeedcafe);
  const table = new ArrayBuffer(36 + 112 + 4),
    tv = new DataView(table);
  tv.setUint16(2, 16, true);
  tv.setUint32(16, 1, true);
  tv.setUint32(20, 1, true);
  tv.setUint32(148, 0xfeedcafe, true);
  const tr = new Reader(table);
  tr.skip(1);
  new AllegroRecordReader(tr, h).read(0x36);
  expect(tr.offset).toBe(148);
  expect(tr.u32()).toBe(0xfeedcafe);
});
