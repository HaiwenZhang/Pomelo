import type { BoardText, Point } from "../board/model";
import { TextShape } from "../board/shapes/text";

import { StrokeFont } from "./stroke-font";

export interface TextStroke {
  a: Point;
  b: Point;
  width: number;
}

export class BoardTextStrokeBuilder {
  private static readonly glyphCache = new Map<string, Point[][]>();
  static supportsGlyph(ch: string) {
    return (
      ch === "\n" ||
      ch === "\r" ||
      ch === "\t" ||
      StrokeFont.glyph(ch) !== undefined
    );
  }
  private static glyphPaths(ch: string): Point[][] {
    const key = StrokeFont.glyph(ch) === undefined ? "?" : ch;
    let paths = BoardTextStrokeBuilder.glyphCache.get(key);
    if (paths) return paths;
    const encoded = StrokeFont.glyph(key)!;
    paths = [];
    let path: Point[] = [];
    for (let i = 2; i < encoded.length; i += 2) {
      if (encoded.slice(i, i + 2) === " R") {
        if (path.length) paths.push(path);
        path = [];
      } else path.push([encoded.charCodeAt(i), encoded.charCodeAt(i + 1)]);
    }
    if (path.length) paths.push(path);
    let min = Infinity,
      max = -Infinity;
    for (const p of paths.flat()) {
      min = Math.min(min, p[0]);
      max = Math.max(max, p[0]);
    }
    const center = (min + max) / 2,
      span = Math.max(14, max - min);
    paths = paths.map((path) =>
      path.map(
        (p) => [0.5 + (p[0] - center) / span, (91 - p[1]) / 21] as Point,
      ),
    );
    BoardTextStrokeBuilder.glyphCache.set(key, paths);
    return paths;
  }
  /** Board text is sized in mm and has no automatic-label size cap. */
  static build(text: BoardText): TextStroke[] {
    const result: TextStroke[] = [];
    for (const stroke of BoardTextStrokeBuilder.buildSteps(text))
      if (stroke) result.push(stroke);
    return result;
  }
  /** Stream strokes and yield even for long runs of whitespace. */
  static *buildSteps(text: BoardText): Generator<TextStroke | undefined> {
    // Otherwise every glyph collapses into a point which the GPU hairline rule
    // would incorrectly turn into a visible dot, even at extreme magnification.
    if (new TextShape(text).isZeroSize()) return;
    const cos = Math.cos(text.angle),
      sin = Math.sin(text.angle),
      mirror = text.mirrored ? -1 : 1;
    const transform = (x: number, y: number): Point => [
      text.at[0] + mirror * x * cos - y * sin,
      text.at[1] + mirror * x * sin + y * cos,
    ];
    // Zero photo width is a hairline: the GPU applies its minimum pixel coverage.
    let work = 0;
    for (const [row, line] of text.text
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, "    ")
      .split("\n")
      .entries()) {
      const characters = [...line],
        length = characters.length
          ? characters.length * text.width +
            (characters.length - 1) * text.spacing
          : 0;
      const left =
        text.align === "right"
          ? -length
          : text.align === "center"
            ? -length / 2
            : 0;
      for (const [column, ch] of characters.entries()) {
        if ((++work & 255) === 0) yield;
        for (const path of BoardTextStrokeBuilder.glyphPaths(ch)) {
          const points = path.map((p) =>
            transform(
              left + column * (text.width + text.spacing) + p[0] * text.width,
              p[1] * text.height - row * text.lineSpacing,
            ),
          );
          for (let i = 1; i < points.length; i++)
            yield {
              a: points[i - 1],
              b: points[i],
              width: text.strokeWidth,
            };
        }
      }
    }
  }
}
