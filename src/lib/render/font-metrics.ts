export interface Glyph {
  uv: number[];
  plane: number[];
  advance: number;
}
export interface FontAtlas {
  size: number;
  range: number;
  glyphs: Record<string, Glyph>;
}

interface MsdfMetadata {
  atlas: {
    size: number;
    distanceRange: number;
    width: number;
    height: number;
    yOrigin: string;
  };
  glyphs: {
    unicode: number;
    advance: number;
    planeBounds?: { left: number; bottom: number; right: number; top: number };
    atlasBounds?: { left: number; bottom: number; right: number; top: number };
  }[];
}

// Calibration parameters for this viewer, not Allegro's internal formulas.
export const LABEL_LAYOUT = {
  minimumTextPixels: 8,
  trackMinimumWidth: 12,
  trackHeightRatio: 0.68,
  trackMinimumSpacing: 180,
  viaMinimumDiameter: 22,
  zoneViewportWidthRatio: 0.2,
  zoneViewportHeightRatio: 0.2,
  zoneGlyphHeightRatio: 0.9,
  zoneMinimumHeight: 10,
} as const;

export class FontMetrics {
  private static readonly advances = new WeakMap<
    FontAtlas,
    Map<string, number>
  >();

  static fromMsdf(data: MsdfMetadata): FontAtlas {
    if (data.atlas.yOrigin !== "bottom")
      throw Error("Unsupported MSDF atlas origin");
    const { width, height } = data.atlas;
    const glyphs: FontAtlas["glyphs"] = {};
    for (const glyph of data.glyphs) {
      const p = glyph.planeBounds;
      const a = glyph.atlasBounds;
      glyphs[String.fromCodePoint(glyph.unicode)] = {
        // The label shader starts its quad at the lower-left corner. Its UV
        // swizzle expects [left, top, right, bottom] in texture coordinates.
        uv: a
          ? [
              a.left / width,
              (height - a.top) / height,
              a.right / width,
              (height - a.bottom) / height,
            ]
          : [0, 0, 0, 0],
        plane: p ? [p.left, p.bottom, p.right, p.top] : [0, 0, 0, 0],
        advance: glyph.advance,
      };
    }
    return { size: data.atlas.size, range: data.atlas.distanceRange, glyphs };
  }

  /** Cached glyph width in font units; a completed board can release its atlas. */
  static advance(font: FontAtlas, text: string): number {
    let cache = FontMetrics.advances.get(font);
    if (!cache) {
      cache = new Map();
      FontMetrics.advances.set(font, cache);
    }
    const previous = cache.get(text);
    if (previous !== undefined) return previous;
    let width = 0;
    for (const character of text)
      width += (font.glyphs[character] ?? font.glyphs["?"]).advance;
    if (cache.size >= 32768) cache.clear();
    cache.set(text, width);
    return width;
  }
}
