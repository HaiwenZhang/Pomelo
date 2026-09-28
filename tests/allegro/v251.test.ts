import { expect, test } from "vitest";
import { AllegroHeaderReader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroRecordReader } from "../../src/lib/allegro/binary/record-reader";
import { AllegroParser } from "../../src/lib/allegro/parser";
import { AllegroSceneBuilder } from "../../src/lib/allegro/scene-builder";
import type { BrdDatabase } from "../../src/lib/allegro/database";

function fixture(size = 0x1300) {
  const buffer = new ArrayBuffer(size),
    view = new DataView(buffer);
  view.setUint32(0, 0x160100, true);
  view.setUint32(0x28c, 1000, true);
  return { buffer, view };
}

test("25.1 reads tail-first relocated lists without treating head IDs as sentinels", () => {
  const { buffer, view } = fixture();
  for (let i = 0; i < 28; i++) {
    view.setUint32(0x60 + 8 * i, 101 + i, true);
    view.setUint32(0x64 + 8 * i, 1001 + i, true);
  }
  view.setUint32(0x14, 400, true);
  view.setUint32(0x28, 500, true);
  view.setUint32(0x34, 600, true);
  view.setUint8(0x1ac, 3);
  new Uint8Array(buffer).set(new TextEncoder().encode("25.1 fixture"), 0x144);
  const h = new AllegroHeaderReader(buffer).read();
  expect(h.version).toBe(251);
  expect(h.writerVersion).toBe("25.1 fixture");
  expect(h.textList).toEqual({ head: 1011, tail: 111 });
  expect(h.graphicList).toEqual({ head: 1005, tail: 105 });
  expect(h.sentinelKeys).toEqual(Array.from({ length: 28 }, (_, i) => 101 + i));
  expect([
    h.objectCount,
    h.constraintEnd,
    h.stringCount,
    h.units,
    h.divisor,
  ]).toEqual([400, 500, 600, 3, 1000]);
});

test("25.1 font tables preserve spacing, photo width, capacity and the following record", async () => {
  const { buffer, view } = fixture(0x1200 + 36 + 2 * 64 + 12);
  const start = 0x1200;
  view.setUint8(start, 0x36);
  view.setUint16(start + 2, 8, true);
  view.setUint32(start + 4, 500, true);
  view.setUint32(start + 16, 2, true);
  view.setUint32(start + 20, 1, true);
  [2500, 1600, 600, 3100, 0, 125].forEach((n, i) =>
    view.setUint32(start + 36 + 8 + i * 4, n, true),
  );
  const next = start + 36 + 128;
  view.setUint8(next, 0x21);
  view.setUint32(next + 4, 12, true);
  view.setUint32(next + 8, 501, true);
  const db = await new AllegroParser(buffer).parse();
  expect(db.count).toBe(2);
  expect(db.get(500)?.Fonts).toEqual([
    {
      Height: 2500,
      Width: 1600,
      CharacterSpace: 600,
      LineSpace: 3100,
      StrokeWidth: 125,
    },
  ]);
  expect(db.get(501)?.type).toBe(0x21);
  expect(db.endOffset).toBe(buffer.byteLength);
});

for (const value of ["", "(SKIDL)"])
  test(`25.1 SI payload ${JSON.stringify(value)} starts after both metadata words`, () => {
    const { buffer } = fixture();
    const header = new AllegroHeaderReader(buffer).read();
    const bytes = new ArrayBuffer(48),
      v = new DataView(bytes);
    v.setUint32(4, 500, true);
    v.setUint32(20, value.length, true);
    v.setUint32(24, 123, true);
    v.setUint32(28, 456, true);
    new Uint8Array(bytes).set(new TextEncoder().encode(value), 32);
    const end = 32 + Math.ceil(value.length / 4) * 4;
    v.setUint32(end, 0xfeedcafe, true);
    const r = new Reader(bytes);
    r.skip(1);
    const record = new AllegroRecordReader(r, header).read(0x1e);
    expect(record).toMatchObject({
      String: value,
      Unknown4: 123,
      Unknown5: 456,
    });
    expect(r.offset).toBe(end);
    expect(r.u32()).toBe(0xfeedcafe);
    const short = new Reader(bytes.slice(0, end - 1));
    short.skip(1);
    expect(() => new AllegroRecordReader(short, header).read(0x1e)).toThrow();
  });

test("hatched copper accepts its owner as hole-list terminator and still rejects missing holes", async () => {
  const shape = {
    type: 0x28,
    Key: 10,
    Next: 2,
    Layer: 6,
    Unknown2: 2,
    Unknown4: 10,
    FirstSegmentPtr: 20,
    FirstKeepoutPtr: 10,
  };
  const rows = new Map<number, object>([
    [1, { type: 0x2a, Entries: [{ Name: "TOP" }] }],
    [10, shape],
    [
      20,
      {
        type: 0x15,
        Key: 20,
        Next: 10,
        StartX: 0,
        StartY: 0,
        EndX: 1000,
        EndY: 0,
        Width: 100,
      },
    ],
  ]);
  const db = {
    header: {
      version: 251,
      units: 3,
      divisor: 1000,
      layerMap: { 6: { recordId: 1 } },
      textList: { head: 0, tail: 111 },
    },
    strings: new Map(),
    get: (id: number) => rows.get(id),
    *records(type: number) {
      if (type === 4) yield { Key: 2, ConnItem: 10, Net: 3 };
      if (type === 0x28) yield shape;
    },
  } as unknown as BrdDatabase;
  const scene = await new AllegroSceneBuilder(db).build();
  expect(scene.segments).toHaveLength(1);
  expect(scene.segments[0].net).toBe(3);
  shape.FirstKeepoutPtr = 99;
  await expect(new AllegroSceneBuilder(db).build()).rejects.toThrow(
    /missing hole 99/,
  );
});
