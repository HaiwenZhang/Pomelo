import { KiCadSceneContext } from "./context";
import { kiCadRequired as required, kiCadPosition as position } from "./fields";
import { BoundsAccumulator } from "../../board/bounds";
import type { Bounds, Layer, Segment, Via } from "../../board/model";

import { cooperative } from "../../cooperative";
import { kiCadArcThrough } from "./arc";
import type { KiCadBoardIndex } from "../syntax/index";
import {
  kiCadAtom,
  kiCadChild,
  kiCadNumber,
  KiCadExpressionReader,
} from "../syntax/sexpr";
const counts = (index: KiCadBoardIndex, name: string) =>
  index.items.get(name) ?? [];
export interface KiCadRouteModel {
  layers: Layer[];
  nets: Map<number, string>;
  segments: Segment[];
  vias: Via[];
  bounds: Bounds;
  sourceSegments: number;
  sourceArcs: number;
  sourceVias: number;
  degenerateArcs: number;
}
/** KiCad board tracks and drilled vias. Names, not numeric layer slots, are
 * authoritative: newer files renumber B.Cu and use named net references. */
export class KiCadRouteBuilder {
  constructor(
    private readonly index: KiCadBoardIndex,
    private readonly context?: KiCadSceneContext,
  ) {}
  async build(signal?: AbortSignal): Promise<KiCadRouteModel> {
    const { index } = this;
    const expressions = new KiCadExpressionReader(index.bytes);
    signal?.throwIfAborted();
    const context =
      this.context ?? (await KiCadSceneContext.read(index, signal));
    const { layers, nets, layerIds } = context;
    const layerId = (name: string) => {
      const id = layerIds.get(name);
      if (id === undefined) throw new Error(`KiCad 走线引用未知铜层 ${name}`);
      return id;
    };
    const extent = new BoundsAccumulator(),
      bounds = extent.bounds;
    const include = extent.include;
    const segments: Segment[] = [],
      vias: Via[] = [],
      pause = cooperative(signal);
    let degenerateArcs = 0;
    const sourceSegments = counts(index, "segment").length,
      sourceArcs = counts(index, "arc").length,
      sourceVias = counts(index, "via").length;
    for (const [kind, spans] of [
      ["segment", counts(index, "segment")],
      ["arc", counts(index, "arc")],
    ] as const) {
      for (const span of spans) {
        if (segments.length % 512 === 0) {
          const pending = pause();
          if (pending) await pending;
        }
        const node = expressions.read(span),
          a = position(required(node, "start")),
          b = position(required(node, "end")),
          width = kiCadNumber(required(node, "width")),
          layer = layerId(kiCadAtom(required(node, "layer")));
        if (!(width > 0))
          throw new Error(`KiCad ${kind} 宽度无效 @${span.start}`);
        const segment: Segment = {
          id: 0x40000000 + segments.length,
          trackId: 0x40000000 + segments.length,
          layer,
          net: context.net(node),
          a,
          b,
          width,
        };
        if (kind === "arc") {
          try {
            const geometry = kiCadArcThrough(
              a,
              position(required(node, "mid")),
              b,
            );
            if (geometry) segment.arc = geometry;
            else degenerateArcs++;
          } catch (error) {
            throw new Error(`KiCad 圆弧 @${span.start}: ${String(error)}`);
          }
        }
        segments.push(segment);
        extent.includeSegment(segment);
      }
    }
    for (const span of counts(index, "via")) {
      if (vias.length % 256 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const node = expressions.read(span),
        at = position(required(node, "at")),
        size = kiCadNumber(required(node, "size")),
        drill = kiCadNumber(required(node, "drill"));
      if (kiCadChild(node, "padstack"))
        throw new Error(`KiCad Via 分层 Padstack 尚未适配 @${span.start}`);
      if (!(size > 0) || !(drill >= 0) || drill >= size)
        throw new Error(`KiCad Via 孔径或铜径无效 @${span.start}`);
      const pair = required(node, "layers"),
        a = layerId(kiCadAtom(pair, 0)),
        b = layerId(kiCadAtom(pair, 1)),
        first = Math.min(a, b),
        last = Math.max(a, b);
      if (first === last)
        throw new Error(`KiCad Via 层跨度无效 @${span.start}`);
      const via: Via = {
        id: 0x50000000 + vias.length,
        net: context.net(node),
        at,
        padstack: vias.length,
        drill,
        startLayer: first,
        endLayer: last,
        pads: Array.from({ length: last - first + 1 }, (_, offset) => ({
          layer: first + offset,
          type: 2,
          width: size,
          height: size,
          offset: [0, 0],
        })),
      };
      vias.push(via);
      const r = size / 2;
      include({
        minX: at[0] - r,
        minY: at[1] - r,
        maxX: at[0] + r,
        maxY: at[1] + r,
      });
    }
    return {
      layers,
      nets,
      segments,
      vias,
      bounds,
      sourceSegments,
      sourceArcs,
      sourceVias,
      degenerateArcs,
    };
  }
}
/** Compatibility entry point; parsing state belongs to KiCadRouteBuilder. */
export async function buildKiCadRouteModel(
  index: KiCadBoardIndex,
  signal?: AbortSignal,
): Promise<KiCadRouteModel> {
  return new KiCadRouteBuilder(index).build(signal);
}
