import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { expect, test } from "vitest";
import { ViewToolbar } from "../../src/components/workspace/view-toolbar";
import { createViewerI18n } from "../../src/i18n";

test("view toolbar visibly identifies the color mode switch and its default choice", () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createViewerI18n("en") },
      createElement(ViewToolbar, { renderer: null }),
    ),
  );
  expect(html).toContain(">Color mode</span>");
  expect(html).toContain(">Layer</button>");
  expect(html).toContain(">Net</button>");
  expect(html).toMatch(/aria-label="Color By Net" aria-pressed="true"/);
  expect(html).not.toContain('aria-label="Flip"');
});

test("capsule toolbar leaves panel controls to the side panels", () => {
  const html = renderToStaticMarkup(
    createElement(
      I18nextProvider,
      { i18n: createViewerI18n("en") },
      createElement(ViewToolbar, { renderer: null }),
    ),
  );
  expect(html).not.toContain('id="toggle-layers"');
  expect(html).not.toContain('id="toggle-inspector"');
  expect(html).toContain('aria-label="Canvas tools"');
  expect(html).toContain('aria-label="Color mode"');
});
