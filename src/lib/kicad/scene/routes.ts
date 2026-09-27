import type { Bounds, Layer, Point, Segment, Via } from "../../board/model";
import { SegmentShape } from "../../board/shapes/segment";
import { cooperative } from "../../cooperative";
import { kiCadArcThrough } from "./arc";
import type { KiCadBoardIndex } from "../syntax/index";
import {
  kiCadAtom,
  kiCadChild,
  kiCadNumber,
  KiCadExpressionReader,
  type KiCadExpression,
} from "../syntax/sexpr";
const colors = [
  "#58b5ed",
  "#83ce94",
  "#edb963",
  "#ba8bec",
  "#eb819d",
  "#54c7bd",
];
const required = (node: KiCadExpression, name: string) => {
  const child = kiCadChild(node, name);
  if (!child) throw new Error(`KiCad ${node.head} 缺少 ${name}`);
  return child;
};
const position = (node: KiCadExpression): Point => [
  kiCadNumber(node, 0),
  -kiCadNumber(node, 1),
];
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
  constructor(private readonly index: KiCadBoardIndex) {}
  async build(signal?: AbortSignal): Promise<KiCadRouteModel> {
    const { index } = this;
    const expressions = new KiCadExpressionReader(index.bytes);
    signal?.throwIfAborted();
    const layerSpans = counts(index, "layers");
    if (layerSpans.length !== 1) throw new Error("KiCad 层表缺失或重复");
    const layerNode = expressions.read(layerSpans[0]);
    const layers: Layer[] = [],
      layerIds = new Map<string, number>();
    for (const value of layerNode.values) {
      if (typeof value === "string") continue;
      const name = kiCadAtom(value, 0);
      if (!name.endsWith(".Cu")) continue;
      if (layerIds.has(name)) throw new Error(`KiCad 重复铜层 ${name}`);
      const id = layers.length;
      layerIds.set(name, id);
      layers.push({
        id,
        name,
        color: colors[id % colors.length],
        layerFunction: "conductor",
      });
    }
    if (layers.length < 2) throw new Error("KiCad 缺少至少两个铜层");
    const nets = new Map<number, string>(),
      netNames = new Map<string, number>();
    for (const span of counts(index, "net")) {
      const node = expressions.read(span),
        id = kiCadNumber(node, 0),
        name = kiCadAtom(node, 1);
      if (!Number.isSafeInteger(id) || id < 0 || nets.has(id))
        throw new Error(`KiCad 网络编号无效 ${id}`);
      if (id !== 0) {
        nets.set(id, name);
        netNames.set(name, id);
      }
    }
    let nextNet = Math.max(0, ...nets.keys()) + 1;
    const netId = (node: KiCadExpression) => {
      const field = kiCadChild(node, "net");
      if (!field) return 0;
      const value = kiCadAtom(field);
      if (/^\d+$/.test(value)) {
        const id = Number(value);
        if (id === 0) return 0;
        if (!nets.has(id)) throw new Error(`KiCad 网络编号没有定义 ${id}`);
        return id;
      }
      if (!value) return 0;
      let id = netNames.get(value);
      if (id === undefined) {
        id = nextNet++;
        netNames.set(value, id);
        nets.set(id, value);
      }
      return id;
    };
    const layerId = (name: string) => {
      const id = layerIds.get(name);
      if (id === undefined) throw new Error(`KiCad 走线引用未知铜层 ${name}`);
      return id;
    };
    const bounds: Bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    const include = (box: Bounds) => {
      bounds.minX = Math.min(bounds.minX, box.minX);
      bounds.minY = Math.min(bounds.minY, box.minY);
      bounds.maxX = Math.max(bounds.maxX, box.maxX);
      bounds.maxY = Math.max(bounds.maxY, box.maxY);
    };
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
          net: netId(node),
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
        include(new SegmentShape(segment).bounds());
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
        net: netId(node),
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
