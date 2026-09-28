import { expect, test } from "vitest";
import { BrdDatabase } from "../../src/lib/allegro/database";
import type { BrdHeader } from "../../src/lib/allegro/binary/header";

test.each([152, 174])(
  "V%s interleaved iterators and random access keep independent records",
  (version) => {
    const size = version < 160 ? 40 : 44;
    const buffer = new ArrayBuffer(size * 3),
      view = new DataView(buffer);
    for (let i = 0; i < 3; i++) {
      const offset = size * i;
      if (version < 160) view.setUint16(offset, (0x15 << 10) | 0x200, true);
      else view.setUint8(offset, 0x15);
      view.setUint32(offset + 4, i + 1, true);
      view.setInt32(offset + (version < 160 ? 24 : 28), -100 - i, true);
    }
    const db = new BrdDatabase(buffer, { version } as BrdHeader, new Map());
    db.byType.set(0x15, [0, size, size * 2]);
    for (let i = 0; i < 3; i++) db.offsets.add(i + 1, i * size);
    const a = db.records(0x15),
      b = db.records(0x15);
    const first = a.next().value!;
    expect(db.get(3)?.StartX).toBe(-102);
    expect(b.next().value!.Key).toBe(1);
    expect(a.next().value!.Key).toBe(2);
    first.StartX = 999;
    expect(db.get(1)?.StartX).toBe(-100);
    expect(() => db.at(buffer.byteLength - 1)).toThrow();
    expect(db.get(2)?.StartX).toBe(-101);
    expect(a.next().value!.Key).toBe(3);
    expect(b.next().value!.Key).toBe(2);
  },
);
