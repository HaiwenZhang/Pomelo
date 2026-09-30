import { expect, test } from "vitest";
import { createViewerI18n } from "../../src/i18n";
import { hfssDefError, parserError } from "../../src/lib/parser-error";
import { localizeError } from "../../src/i18n/messages";

test("parser errors use the requested language at the throw site", () => {
  const detail = { detail: "0x31" };
  expect(
    parserError("brdUnalignedRecord", detail, createViewerI18n("zh-CN"))
      .message,
  ).toBe("记录未对齐：0x31");
  expect(
    parserError("brdUnalignedRecord", detail, createViewerI18n("zh-TW"))
      .message,
  ).toBe("記錄未對齊：0x31");
  expect(
    parserError("brdUnalignedRecord", detail, createViewerI18n("ja")).message,
  ).toBe("BRD レコードが 0x31 で整列していません");
  expect(
    parserError("brdUnalignedRecord", detail, createViewerI18n("en")).message,
  ).toBe("BRD record is unaligned at 0x31");
});

test("structured failures translate again after changing language, including nested DEF reasons", async () => {
  const translator = createViewerI18n("en");
  const error = hfssDefError("undefinedRecord", 0x30, 17, translator);
  expect(localizeError(error, translator)).toBe(
    "Could not open this board: HFSS DEF has undefined record type 17 at offset 0x30",
  );
  await translator.changeLanguage("zh-CN");
  expect(localizeError(error, translator)).toBe(
    "打开板图失败：HFSS DEF 未定义的记录类型 17（偏移 0x30）",
  );
  expect(error.code).toBe("hfssDefError");
  expect(error.params.value).toBe("0x30");
});

test("DEF errors translate their reason and retain the byte offset", () => {
  expect(
    hfssDefError("truncated", 0x20, undefined, createViewerI18n("en")).message,
  ).toBe("HFSS DEF file is truncated at offset 0x20");
  expect(
    hfssDefError("truncated", 0x20, undefined, createViewerI18n("ja")).message,
  ).toBe("HFSS DEF ファイルが途中で切れています (オフセット 0x20)");
});
