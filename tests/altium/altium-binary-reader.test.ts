import { test, expect } from "vitest";

import { AltiumBinaryReader } from "../../src/lib/altium/binary/binary-records";

test("should retain separate offsets when iterating single-part records without copying payloads", () => {
  const data = new Uint8Array([
    99, 99, 4, 2, 0, 0, 0, 7, 8, 4, 1, 0, 0, 0, 9,
  ]).subarray(2);
  const records = [...new AltiumBinaryReader(data, 4, 1, 2).singleRecords()];
  expect(
    records.map((r) => ({
      index: r.index,
      start: r.start,
      end: r.end,
      length: r.length,
      value: r.view.getUint8(r.offset),
    })),
  ).toStrictEqual([
    { index: 0, start: 0, end: 7, length: 2, value: 7 },
    { index: 1, start: 7, end: 13, length: 1, value: 9 },
  ]);
});

test("should reject malformed framing when iterating single-part records", () => {
  const read = (data: number[], type = 4, count = 1) => [
    ...new AltiumBinaryReader(
      new Uint8Array(data),
      type,
      1,
      count,
    ).singleRecords(),
  ];
  expect(() => read([4, 2, 0, 0, 0, 7])).toThrow(/越界/);
  expect(() => read([4, 2, 0])).toThrow(/截断/);
  expect(() => read([3, 0, 0, 0, 0])).toThrow(/类型/);
  expect(() => read([4, 0, 0, 0, 0, 7])).toThrow(/剩余/);
  expect(() => read([], 4, 1)).toThrow(/提前结束/);
  expect(() => read([], 4, -1)).toThrow(/声明/);
});
