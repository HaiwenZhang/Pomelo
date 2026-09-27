import type { BoardText } from "../../board/model";
import type { DrawingLayer } from "../../board/model";
import { cooperative } from "../../cooperative";
import type { AltiumLayers } from "../layers";
import {
  altiumProperty,
  type AltiumPropertiesRecord,
} from "../binary/properties";
import { AltiumTextReader, AltiumWideStringReader } from "../records/texts";
export interface AltiumTextModel {
  texts: BoardText[];
  drawingLayers: DrawingLayer[];
  sourceTexts: number;
  emptyTexts: number;
  nonStrokeFonts: number;
}
type AltiumTextInput = {
  data: Uint8Array;
  count: number;
  wideData: Uint8Array;
  stack: AltiumLayers;
  board: AltiumPropertiesRecord;
};
export class AltiumTextBuilder {
  constructor(private readonly input: AltiumTextInput) {}
  async build(signal?: AbortSignal): Promise<AltiumTextModel> {
    const { data, count, wideData, stack, board } = this.input;
    const wide = new AltiumWideStringReader(wideData).read(),
      texts: BoardText[] = [],
      drawingLayers: DrawingLayer[] = [];
    const drawingLayerIds = new Set<number>();
    let emptyTexts = 0,
      nonStrokeFonts = 0;
    const pause = cooperative(signal);
    for (const source of new AltiumTextReader(data, count, wide).records()) {
      if ((source.index & 255) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      if (!source.text || source.height <= 0) {
        emptyTexts++;
        continue;
      }
      const copper = stack.v6.get(source.layer),
        layer = copper ?? 0x20000 + source.layer;
      if (copper === undefined && !drawingLayerIds.has(layer)) {
        drawingLayerIds.add(layer);
        drawingLayers.push({
          id: layer,
          name:
            altiumProperty(board, `LAYER${source.layer}NAME`) ??
            `Altium Layer ${source.layer}`,
          color:
            source.layer === 33
              ? "#e3e7d3"
              : source.layer === 34
                ? "#d8c5d4"
                : "#a7a9bd",
          layerFunction: "unknown",
          defaultVisible: source.layer === 33,
        });
      }
      // BoardScene uses one built-in stroke alphabet. Preserve source placement
      // and Unicode content; non-stroke font faces are intentionally approximate.
      if (source.fontType !== 0) nonStrokeFonts++;
      texts.push({
        id: 0x71000000 + source.index,
        layer,
        classId: 0,
        subclass: source.layer,
        text: source.text,
        at: source.at,
        angle: source.angle,
        mirrored: source.mirrored,
        align: "left",
        fontIndex: source.fontIndex,
        width: source.height * 0.65,
        height: source.height,
        spacing: 0,
        lineSpacing: source.height * 1.3,
        strokeWidth: source.strokeWidth || Math.min(0.05, source.height * 0.08),
      });
    }
    return {
      texts,
      drawingLayers,
      sourceTexts: count,
      emptyTexts,
      nonStrokeFonts,
    };
  }
}
/** Compatibility entry point; parsing state belongs to AltiumTextBuilder. */
export async function buildAltiumTextModel(
  data: Uint8Array,
  count: number,
  wideData: Uint8Array,
  stack: AltiumLayers,
  board: AltiumPropertiesRecord,
  signal?: AbortSignal,
): Promise<AltiumTextModel> {
  return new AltiumTextBuilder({ data, count, wideData, stack, board }).build(
    signal,
  );
}
