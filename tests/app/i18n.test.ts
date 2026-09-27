import { test, expect } from "vitest";

import { createViewerI18n } from "../../src/i18n";
import japanese from "../../src/i18n/ja.json";
import { translations } from "../../src/i18n/resources";

test("viewer translations switch between Chinese and English with interpolation", async () => {
  const translator = createViewerI18n("zh-CN");
  expect(translator.t("workspace.openFile")).toBe("打开文件");
  await translator.changeLanguage("en");
  expect(translator.t("workspace.openFile")).toBe("Open file");
  expect(translator.t("workspace.fileSize", { size: "2.50" })).toBe(
    "File size: 2.50 MB",
  );
});

test("unsupported languages fall back to English", () => {
  const translator = createViewerI18n("fr");
  expect(translator.t("workspace.openFile")).toBe("Open file");
  expect(translator.language).toBe("en");
});

test("English is the default language", () => {
  const translator = createViewerI18n();
  expect(translator.language).toBe("en");
  expect(translator.t("workspace.openFile")).toBe("Open file");
});

test("Traditional Chinese and Japanese translate the interface and interpolate values", () => {
  const traditional = createViewerI18n("zh-TW");
  const japanese = createViewerI18n("ja");
  expect(traditional.t("workspace.openFile")).toBe("打開檔案");
  expect(traditional.t("workspace.fileSize", { size: "2.50" })).toBe(
    "檔案大小：2.50 MB",
  );
  expect(japanese.t("workspace.openFile")).toBe("ファイルを開く");
  expect(japanese.t("workspace.fileSize", { size: "2.50" })).toBe(
    "ファイルサイズ: 2.50 MB",
  );
});

test("new languages cover every interface, metadata, progress and general error key", () => {
  const groups = [
    "workspace",
    "search",
    "display",
    "layers",
    "order",
    "inspector",
    "status",
    "metadata",
    "progress",
    "errors",
  ] as const;
  const keys = (value: object, prefix = ""): string[] =>
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string"
        ? [`${prefix}${key}`]
        : keys(entry, `${prefix}${key}.`),
    );
  for (const language of ["zh-TW", "ja"] as const) {
    for (const group of groups) {
      const english = keys(translations.en.translation[group]).filter(
        (key) => group !== "metadata" || !/^layer_(one|other)$/.test(key),
      );
      const localized = keys(
        language === "ja"
          ? japanese[group]
          : translations[language].translation[group],
      );
      expect(localized).toEqual(expect.arrayContaining(english));
    }
  }
});
