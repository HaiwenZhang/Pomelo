import { expect, test } from "vitest";
import { PadsBinaryView } from "../../src/lib/pads/binary/view";
import { ParserError } from "../../src/lib/parser-error";
import { createViewerI18n } from "../../src/i18n";
import { localizeError } from "../../src/i18n/messages";

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

test.each([
  "字段",
  "焊盘字段",
  "封装字段",
  "走线字段",
  "接点字段",
  "铺铜字段",
  "连接字段",
] as const)(
  "%s range failures retain section identity and byte ranges when translated",
  (field) => {
    const view = new PadsBinaryView(new DataView(new ArrayBuffer(4)), field);
    let failure: unknown;
    try {
      view.range(0, 52);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(ParserError);
    const english = localizeError(
      failure as ParserError,
      createViewerI18n("en"),
    );
    expect(english).toContain("0+52/4");
    expect(english).toContain("field is out of bounds");
    expect(english).not.toMatch(/[\p{Script=Han}]/u);
  },
);

test("container bounds errors preserve offset, requested size and total size in translations", () => {
  const view = new PadsBinaryView(new DataView(new ArrayBuffer(4)), "数据");
  let failure: unknown;
  try {
    view.range(0, 52);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(ParserError);
  expect(localizeError(failure as ParserError, createViewerI18n("en"))).toBe(
    "Could not open this board: PADS data is out of bounds at 0+52/4",
  );
});
