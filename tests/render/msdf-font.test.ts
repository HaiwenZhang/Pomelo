import { expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";

import { FontMetrics } from "../../src/lib/render/font-metrics";

test("MSDF font metadata keeps the reference glyph advance, plane and bottom-origin UVs", () => {
  expect(FontMetrics).toHaveProperty("fromMsdf");
  const font = FontMetrics.fromMsdf({
    atlas: {
      size: 42,
      distanceRange: 4,
      width: 100,
      height: 200,
      yOrigin: "bottom",
    },
    glyphs: [
      { unicode: 32, advance: 0.25 },
      {
        unicode: 48,
        advance: 0.58,
        planeBounds: { left: -0.02, bottom: -0.1, right: 0.6, top: 0.8 },
        atlasBounds: { left: 10, bottom: 20, right: 30, top: 60 },
      },
      {
        unicode: 63,
        advance: 0.5,
        planeBounds: { left: 0, bottom: 0, right: 0.5, top: 0.8 },
        atlasBounds: { left: 30, bottom: 20, right: 50, top: 60 },
      },
    ],
  });
  expect(font.size).toBe(42);
  expect(font.range).toBe(4);
  expect(font.glyphs["0"]).toStrictEqual({
    uv: [0.1, 0.7, 0.3, 0.9],
    plane: [-0.02, -0.1, 0.6, 0.8],
    advance: 0.58,
  });
  expect(FontMetrics.advance(font, "0 0")).toBeCloseTo(1.41, 12);
  expect(font.glyphs[" "].plane).toStrictEqual([0, 0, 0, 0]);
});

test("shipped MSDF atlas contains the reference digits and Latin glyph metrics", () => {
  const path = new URL(
    "../../public/fonts/NotoSansSC-SemiBold.json",
    import.meta.url,
  );
  expect(existsSync(path)).toBe(true);
  const font = FontMetrics.fromMsdf(JSON.parse(readFileSync(path, "utf8")));
  expect(font.glyphs["0"].advance).toBe(0.58);
  expect(font.glyphs["1"].advance).toBe(0.58);
  expect(font.glyphs["A"].advance).toBe(0.632);
  expect(font.glyphs["g"].plane[1]).toBeCloseTo(-0.3022857142857142, 12);
  expect(font.glyphs["?"]).toBeDefined();
});
