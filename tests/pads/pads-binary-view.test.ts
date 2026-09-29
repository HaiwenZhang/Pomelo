import { expect, test } from "vitest";
import { PadsBinaryView } from "../../src/lib/pads/binary/view";

test("section reads respect sliced view offsets and reject truncated or non-integral addresses", () => {
  const buffer = new ArrayBuffer(12);
  new DataView(buffer).setInt32(4, -17, true);
  const view = new PadsBinaryView(new DataView(buffer, 4, 4), "焊盘字段");
  expect(view.i32(0)).toBe(-17);
  expect(view.u32(0)).toBe(0xffffffef);
  for (const at of [-1, 1, 0.5, NaN, Infinity])
    expect(() => view.u32(at)).toThrow(/焊盘字段越界/);
  expect(() => view.range(0, NaN)).toThrow(/越界/);
});
