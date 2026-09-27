import { test, expect } from "vitest";

import type { BrdHeader } from "../../src/lib/allegro/binary/header";
import { Reader } from "../../src/lib/allegro/binary/reader";
import { AllegroStringTableReader } from "../../src/lib/allegro/binary/string-table";
import { BrdTextDecoder } from "../../src/lib/allegro/binary/text-decoder";
import { BrdDatabase } from "../../src/lib/allegro/database";

test("explicit legacy encodings restore original Chinese and Japanese without lossy UTF-8 conversion", () => {
  expect(
    new BrdTextDecoder("gbk").decode(Buffer.from("c7b0c9e3", "hex"), 32),
  ).toBe("前摄");
  expect(
    new BrdTextDecoder("shift_jis").decode(
      Buffer.from("9594956996ca8e8b", "hex"),
      32,
    ),
  ).toBe("部品面視");
  expect(
    new BrdTextDecoder("gbk").decode(Buffer.from("a6b8a1c0", "hex"), 32),
  ).toBe("Ω±");
  expect(
    new BrdTextDecoder().decode(new TextEncoder().encode("前摄 部品 Ω±"), 32),
  ).toBe("前摄 部品 Ω±");
  // Byte-validity alone cannot resolve this ambiguity. Do not guess per string.
  expect(
    new BrdTextDecoder("gbk").decode(
      Buffer.from("9594956996ca8e8b", "hex"),
      32,
    ),
  ).not.toBe("部品面視");
});

test("invalid and truncated sequences retain exact source offsets and repeated lazy reads deduplicate", () => {
  const decoder = new BrdTextDecoder("gbk");
  expect(decoder.decode(Buffer.from([0xa6]), 99)).toBe("�");
  decoder.decode(Buffer.from([0xa6]), 99);
  expect(decoder.issues.size).toBe(1);
  expect(decoder.issues.get(99)).toStrictEqual({
    offset: 99,
    length: 1,
    encoding: "gbk",
  });
  expect(decoder.decode(Buffer.from("c7b0c9e3", "hex"), 200)).toBe("前摄");
  const utf8 = new BrdTextDecoder();
  utf8.decode(Buffer.from([0xff]), 0);
  expect(utf8.issues.size).toBe(1);
  const validReplacement = new BrdTextDecoder();
  validReplacement.decode(new TextEncoder().encode("�"), 0);
  expect(validReplacement.issues.size).toBe(0);
});

test("fixed and zero-terminated strings keep absolute alignment under multibyte decoding", () => {
  const bytes = Uint8Array.from([
    7, 0xc7, 0xb0, 0xc9, 0xe3, 0, 0, 0, 9, 0, 0, 0,
  ]);
  for (const fixed of [false, true]) {
    const reader = new Reader(bytes.buffer, new BrdTextDecoder("gbk"));
    reader.skip(1);
    expect(fixed ? reader.str(5) : reader.cstring()).toBe("前摄");
    expect(reader.u32()).toBe(9);
    expect(reader.textDecoder.issues.size).toBe(0);
  }
});

test("string table and lazy text records share one explicit decoder and preserve raw bytes", async () => {
  const buffer = new ArrayBuffer(0x1240),
    view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  view.setUint32(0x1200, 10, true);
  bytes.set([0xc7, 0xb0, 0xc9, 0xe3, 0, 0, 0, 0], 0x1204);
  bytes[0x120c] = 0x31;
  view.setUint32(0x1210, 20, true);
  view.setUint16(0x1222, 5, true);
  bytes.set([0xc7, 0xb0, 0xc9, 0xe3, 0], 0x1224);
  const before = bytes.slice(),
    header = { version: 172, stringCount: 1 } as BrdHeader,
    decoder = new BrdTextDecoder("gbk");
  const table = await new AllegroStringTableReader(
    buffer,
    header,
    decoder,
  ).read(undefined, undefined);
  expect(table.strings.get(10)).toBe("前摄");
  expect(table.objectOffset).toBe(0x120c);
  const db = new BrdDatabase(buffer, header, table.strings, decoder);
  db.offsets.set(20, 0x120c);
  expect(db.get(20)!.Value).toBe("前摄");
  expect(db.get(20)!.Value).toBe("前摄");
  expect(decoder.issues.size).toBe(0);
  expect(bytes).toStrictEqual(before);
});
