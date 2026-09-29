import { BoardDisplay } from "../board/display";
import type { BoardScene } from "../board/model";

import { type DisplayOptions } from "../board/display";
import { buildArcBatches } from "./arc-batch-builder";
import type { PrimitiveBatch } from "./primitive-batch";

/** Stored drawing strokes use the same compensated line/arc pipelines as copper,
 * while retaining their own layer, visibility and non-electrical identity. */
export function* buildDrawingBatches(
  scene: BoardScene,
  visibility?: DisplayOptions,
  limit = 16384,
): Generator<PrimitiveBatch | undefined> {
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw Error("Invalid drawing batch size");
  const layers = new Map(scene.drawingLayers.map((layer) => [layer.id, layer]));
  const groups = new Map<number, NonNullable<BoardScene["drawings"]>>();
  let work = 0;
  for (const drawing of scene.drawings ?? []) {
    if (
      !layers.has(drawing.layer) ||
      (visibility &&
        !BoardDisplay.isVisible(visibility, drawing.layer, "drawing"))
    )
      continue;
    let group = groups.get(drawing.layer);
    if (!group) {
      group = [];
      groups.set(drawing.layer, group);
    }
    group.push(drawing);
    if ((++work & 255) === 0) yield;
  }
  const originX = (scene.bounds.minX + scene.bounds.maxX) / 2,
    originY = (scene.bounds.minY + scene.bounds.maxY) / 2;
  for (const [layer, drawings] of groups) {
    const color = [1, 3, 5].map(
      (i) => parseInt(layers.get(layer)!.color.slice(i, i + 2), 16) / 255,
    );
    let values: number[] = [];
    for (const drawing of drawings)
      for (const segment of drawing.segments) {
        if (segment.arc)
          values.push(
            segment.arc.center[0] - originX,
            segment.arc.center[1] - originY,
            segment.arc.radius,
            segment.arc.start,
            segment.width,
            segment.arc.sweep,
            1,
            0,
            ...color,
            1,
          );
        else
          values.push(
            segment.a[0] - originX,
            segment.a[1] - originY,
            segment.b[0] - originX,
            segment.b[1] - originY,
            segment.width,
            0,
            0,
            0,
            ...color,
            1,
          );
        if (values.length === limit * 12) {
          yield* buildArcBatches({ layer, category: "drawing" }, values);
          values = [];
        }
        if ((++work & 2047) === 0) yield;
      }
    if (values.length)
      yield* buildArcBatches({ layer, category: "drawing" }, values);
  }
}
