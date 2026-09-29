import type { Segment } from "../../board/model";
import { parserError } from "../../parser-error";
import type { AllegroRecord } from "../binary/record-types";
import { AllegroDrawingBuilder, DIMENSION_LAYER } from "./drawings";
import { AllegroLayerDecoder } from "../decoders/layers";
import { AllegroTextBuilder } from "./text";
import type { AllegroSceneContext } from "./context";

export async function buildGraphics(
  context: AllegroSceneContext,
  outline: Segment[],
) {
  const {
    database: db,
    scale,
    geometry,
    bounds,
    diagnostics,
    buildProgress,
    signal,
  } = context;
  buildProgress.begin("构建板框");
  const dimensionGraphics: AllegroRecord<0x14>[] = [];
  let graphicWork = 0;
  for (const graphic of db.records(20)) {
    if (
      (graphic.Layer & 255) === 1 &&
      [0xea, 0xfd].includes(graphic.Layer >>> 8)
    ) {
      const path = geometry.readPath(graphic.SegmentPtr);
      outline.push(...path);
      for (const segment of path) context.extent.includeSegment(segment);
    }
    if (graphic.Layer === 0xf901) dimensionGraphics.push(graphic);
    if ((++graphicWork & 255) === 0) {
      const pause = buildProgress.checkpoint();
      if (pause) await pause;
    }
  }
  if (!Number.isFinite(bounds.minX)) throw parserError("brdNoGeometry");
  buildProgress.begin("构建原始文字");
  const { texts, drawingLayers } = await new AllegroTextBuilder(
    db,
    scale,
  ).build(diagnostics, signal);
  buildProgress.begin("构建尺寸图形");
  const drawings = await new AllegroDrawingBuilder(db, scale).build(
    dimensionGraphics,
    texts,
    diagnostics,
    signal,
  );
  if (drawings.length && !drawingLayers.some((l) => l.id === DIMENSION_LAYER)) {
    drawingLayers.push(AllegroLayerDecoder.drawingLayer(0xf901));
    drawingLayers.sort(
      (a, b) =>
        Number(b.defaultVisible) - Number(a.defaultVisible) || a.id - b.id,
    );
  }
  return { texts, drawingLayers, drawings };
}
