import type { BoardText, Point } from "../board/model";
import { TextShape } from "../board/shapes/text";
import { MsdfFont } from "./msdf-font";
import type { FontAtlas } from "../render/font-metrics";

export interface TextGlyph {
  page: number;
  /** Label packet: xywh, UV rectangle, RGBA, cos/sin/reflection/page flags. */
  values: number[];
}

export function glyphCorners(glyph: TextGlyph): Point[] {
  const v = glyph.values;
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([x, y]) => [
    v[0] + (x * v[2] * v[12] - y * v[3] * v[13]) * v[14],
    v[1] + x * v[2] * v[13] + y * v[3] * v[12],
  ]);
}

/** Stored design text uses physical cell sizes, spacing and line pitch.
 * MSDF glyph outlines replace the source application's single-line typeface. */
export class BoardTextGlyphBuilder {
  static build(text: BoardText, font: FontAtlas = MsdfFont.font): TextGlyph[] {
    return [...BoardTextGlyphBuilder.buildSteps(text, font)].filter(
      (glyph): glyph is TextGlyph => !!glyph,
    );
  }

  static *buildSteps(
    text: BoardText,
    font: FontAtlas = MsdfFont.font,
  ): Generator<TextGlyph | undefined> {
    if (new TextShape(text).isZeroSize() || text.width <= 0 || text.height <= 0)
      return;
    const cos = Math.cos(text.angle),
      sin = Math.sin(text.angle);
    const mirror = text.mirrored ? -1 : 1;
    // Use the font's capital-letter ink height and keep its baseline at y=0.
    // Plane bounds include the SDF margin, which must remain outside the cell.
    const heightScale = text.height / (font.capHeight ?? 0.733);
    let work = 0;
    for (const [row, line] of text.text
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      .split("\n")
      .entries()) {
      const chars = [...line];
      const length = chars.length
        ? chars.length * text.width + (chars.length - 1) * text.spacing
        : 0;
      const left =
        text.align === "right"
          ? -length
          : text.align === "center"
            ? -length / 2
            : 0;
      for (const [column, ch] of chars.entries()) {
        if ((++work & 255) === 0) yield;
        const g = font.glyphs[ch] ?? font.glyphs["?"];
        if (!g || g.plane[2] <= g.plane[0] || g.plane[3] <= g.plane[1])
          continue;
        const scaleX = text.width / Math.max(g.advance, 0.001);
        const x =
          left + column * (text.width + text.spacing) + g.plane[0] * scaleX;
        const y = g.plane[1] * heightScale - row * text.lineSpacing;
        const page = g.page ?? 0;
        yield {
          page,
          values: [
            text.at[0] + mirror * x * cos - y * sin,
            text.at[1] + mirror * x * sin + y * cos,
            (g.plane[2] - g.plane[0]) * scaleX * mirror,
            (g.plane[3] - g.plane[1]) * heightScale,
            ...g.uv,
            1,
            1,
            1,
            1,
            cos,
            sin,
            1,
            page * 2,
          ],
        };
      }
    }
  }
}
