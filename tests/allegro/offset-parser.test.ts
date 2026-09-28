import { test, expect } from "vitest";

import { AllegroParser } from "../../src/lib/allegro/parser";

function board(keys: number[]) {
  const buffer = new ArrayBuffer(0x1200 + keys.length * 36),
    view = new DataView(buffer);
  view.setUint32(0, 0x140900, true);
  view.setUint32(0x26c, 100, true);
  keys.forEach((key, i) => {
    const offset = 0x1200 + i * 36;
    view.setUint8(offset, 0x14);
    view.setUint32(offset + 4, key, true);
  });
  return buffer;
}
test("parser retains source ordering, high unsigned IDs and key-zero records", async () => {
  const keys = Array.from({ length: 4096 }, (_, i) =>
      i === 0 ? 0 : (0x80000000 + i * 8) >>> 0,
    ),
    db = await new AllegroParser(board(keys), undefined).parse();
  expect(db.count).toBe(keys.length);
  expect(db.offsets.size).toBe(keys.length - 1);
  expect(db.get(0)).toBe(undefined);
  expect([...db.records(0x14)].map((record) => record.Key)).toStrictEqual(keys);
  for (let i = 1; i < keys.length; i++) {
    expect(db.offsets.get(keys[i])).toBe(0x1200 + i * 36);
    expect(db.get(keys[i])!.offset).toBe(0x1200 + i * 36);
  }
});
test("duplicate IDs fail at the duplicate source record instead of replacing the first location", async () => {
  const buffer = board([0, 0xffffffff, 123, 0xffffffff]);
  await expect(new AllegroParser(buffer, undefined).parse()).rejects.toThrow(
    /BRD record #3 of type 0x14 failed at offset 0x126c: Duplicate BRD object ID 4294967295/,
  );
});
