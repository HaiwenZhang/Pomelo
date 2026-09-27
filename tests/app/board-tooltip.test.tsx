import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import {
  TooltipCard,
  placeTooltip,
} from "../../src/components/workspace/board-tooltip";

test("hover information renders as accessible DOM text, including Unicode", () => {
  const html = renderToStaticMarkup(
    createElement(TooltipCard, {
      tooltip: { point: [790, 590], lines: ["Net: 电源", "Width: 0.2000 mm"] },
    }),
  );
  expect(html).toContain('role="tooltip"');
  expect(html).toContain("Net: 电源");
  expect(html).toContain("Width: 0.2000 mm");
  expect(html).not.toContain("\\u{");
});

test("tooltip stays inside the canvas at every corner", () => {
  for (const point of [
    [0, 0],
    [799, 0],
    [0, 599],
    [799, 599],
  ] as const) {
    const placed = placeTooltip(
      point,
      { width: 240, height: 100 },
      { width: 800, height: 600 },
    );
    expect(placed.left).toBeGreaterThanOrEqual(8);
    expect(placed.top).toBeGreaterThanOrEqual(8);
    expect(placed.left + 240).toBeLessThanOrEqual(792);
    expect(placed.top + 100).toBeLessThanOrEqual(592);
  }
});
