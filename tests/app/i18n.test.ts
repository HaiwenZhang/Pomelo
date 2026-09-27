import { test, expect } from "vitest";

import { createViewerI18n } from "../../src/i18n";

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
});
