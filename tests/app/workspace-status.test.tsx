import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { expect, test } from "vitest";
import { WorkspaceStatus } from "../../src/components/workspace/workspace-status";
import { createViewerI18n } from "../../src/i18n";

test("bottom-left status reserves X and Y coordinates instead of connection text", () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createViewerI18n("en") },
      createElement(WorkspaceStatus, { renderer: null }),
    ),
  );
  expect(html).toContain("X: —");
  expect(html).toContain("Y: —");
  expect(html).not.toContain("WebGPU");
});
