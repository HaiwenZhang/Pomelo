import { BoardDisplay } from "../board/display";
import type { BoardScene } from "../board/model";

import { type DisplayOptions } from "../board/display";
import { BoardTextGlyphBuilder } from "../text/board-text-glyph-builder";
import { splitPositionSteps } from "./position-precision";
import type { PrimitiveBatch } from "./primitive-batch";
import { GLYPH_PACKET } from "./primitive-layout";

/** Bound temporary arrays and GPU buffers. Flush at every atlas page change
 * so source order, including overlaps in mixed Chinese/English text, survives. */
export function* buildBoardTextBatches(
  scene: BoardScene,
  visibility?: DisplayOptions,
  glyphsPerBatch = 65536,
): Generator<PrimitiveBatch | undefined> {
  if (!Number.isSafeInteger(glyphsPerBatch) || glyphsPerBatch < 1)
    throw Error("Invalid text batch size");
  const layers = new Map(
    [...scene.layers, ...scene.drawingLayers].map((layer) => [layer.id, layer]),
  );
  const groups = new Map<number, typeof scene.texts>();
  let work = 0;
  for (const text of scene.texts ?? []) {
    if ((++work & 255) === 0) yield;
    if (
      !layers.has(text.layer) ||
      (visibility && !BoardDisplay.isVisible(visibility, text.layer, "text"))
    )
      continue;
    let group = groups.get(text.layer);
    if (!group) {
      group = [];
      groups.set(text.layer, group);
    }
    group.push(text);
  }
  const originX = (scene.bounds.minX + scene.bounds.maxX) / 2,
    originY = (scene.bounds.minY + scene.bounds.maxY) / 2;
  for (const [layer, texts] of groups) {
    const color = [1, 3, 5].map(
      (i) => parseInt(layers.get(layer)!.color.slice(i, i + 2), 16) / 255,
    );
    let values: number[] = [];
    let page = 0;
    function* flush(): Generator<PrimitiveBatch | undefined> {
      if (!values.length) return;
      yield {
        layer,
        category: "text",
        msdf: page,
        ...(yield* splitPositionSteps(
          values,
          GLYPH_PACKET.stride,
          GLYPH_PACKET.positions,
        )),
      };
      values = [];
    }
    for (const text of texts)
      for (const glyph of BoardTextGlyphBuilder.buildSteps(text)) {
        if (!glyph) {
          yield;
          continue;
        }
        if (page !== glyph.page) yield* flush();
        page = glyph.page;
        glyph.values[0] -= originX;
        glyph.values[1] -= originY;
        glyph.values.splice(8, 3, ...color);
        values.push(...glyph.values);
        if (values.length === glyphsPerBatch * GLYPH_PACKET.stride)
          yield* flush();
        if ((++work & 2047) === 0) yield;
      }
    yield* flush();
  }
}
