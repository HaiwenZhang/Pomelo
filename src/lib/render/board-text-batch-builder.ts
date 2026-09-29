import { BoardDisplay } from "../board/display";
import type { BoardScene } from "../board/model";

import { type DisplayOptions } from "../board/display";
import { BoardTextStrokeBuilder } from "../text/board-text-stroke-builder";
import { splitPositions } from "./position-precision";
import type { PrimitiveBatch } from "./primitive-batch";

/** Bound both the temporary number array and each GPU vertex buffer. Texts on
 * one layer retain source/stroke order, including overlaps across chunk edges. */
export function* buildBoardTextBatches(
  scene: BoardScene,
  visibility?: DisplayOptions,
  linesPerBatch = 65536,
): Generator<PrimitiveBatch | undefined> {
  if (!Number.isSafeInteger(linesPerBatch) || linesPerBatch < 1)
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
    for (const text of texts)
      for (const stroke of BoardTextStrokeBuilder.build(text)) {
        values.push(
          stroke.a[0] - originX,
          stroke.a[1] - originY,
          stroke.b[0] - originX,
          stroke.b[1] - originY,
          stroke.width,
          0,
          0,
          0,
          ...color,
          1,
        );
        if (values.length === linesPerBatch * 12) {
          yield {
            layer,
            category: "text",
            ...splitPositions(values, 12, 4),
          };
          values = [];
        }
        if ((++work & 2047) === 0) yield;
      }
    if (values.length)
      yield {
        layer,
        category: "text",
        ...splitPositions(values, 12, 4),
      };
  }
}
