import type {
  BoardDrawing,
  Bounds,
  DrawingLayer,
  Point,
  Segment,
} from "../../board/model";
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
const point = (node: KiCadExpression): Point => [
  kiCadNumber(node, 0),
  -kiCadNumber(node, 1),
];
const required = (node: KiCadExpression, name: string) => {
  const child = kiCadChild(node, name);
  if (!child) throw new Error(`KiCad ${node.head} 缺少 ${name}`);
  return child;
};
export interface KiCadOutlineModel {
  outline: Segment[];
  drawings: BoardDrawing[];
  drawingLayers: DrawingLayer[];
  bounds: Bounds;
  sourceGraphics: number;
  edgeGraphics: number;
  filledGraphics: number;
  degenerateArcs: number;
}
/** Edge.Cuts board geometry only. Other drawing layers remain separate from
 * the physical board outline and are never substituted for a missing edge. */
export class KiCadOutlineBuilder {
  constructor(private readonly index: KiCadBoardIndex) {}
  async build(signal?: AbortSignal): Promise<KiCadOutlineModel> {
    const { index } = this;
    const expressions = new KiCadExpressionReader(index.bytes);
    const outline: Segment[] = [],
      drawings: BoardDrawing[] = [],
      drawingLayers: DrawingLayer[] = [],
      drawingIds = new Map<string, number>();
    const bounds: Bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    let sourceGraphics = 0,
      edgeGraphics = 0,
      filledGraphics = 0,
      degenerateArcs = 0,
      segmentId = 0;
    const pause = cooperative(signal);
    const push = (
      a: Point,
      b: Point,
      width: number,
      drawing?: BoardDrawing,
      arc?: Segment["arc"],
    ) => {
      if (!Number.isFinite(width) || width < 0)
        throw new Error("KiCad 板框线宽无效");
      const id = 0x60000000 + segmentId++,
        segment: Segment = {
          id,
          trackId: id,
          layer: drawing?.layer ?? 0,
          net: 0,
          a,
          b,
          width,
        };
      if (arc) segment.arc = arc;
      if (drawing) drawing.segments.push(segment);
      else outline.push(segment);
      const box = new SegmentShape(segment).bounds();
      bounds.minX = Math.min(bounds.minX, box.minX);
      bounds.minY = Math.min(bounds.minY, box.minY);
      bounds.maxX = Math.max(bounds.maxX, box.maxX);
      bounds.maxY = Math.max(bounds.maxY, box.maxY);
    };
    for (const kind of [
      "gr_line",
      "gr_arc",
      "gr_rect",
      "gr_poly",
      "gr_circle",
    ] as const) {
      const spans = index.items.get(kind) ?? [];
      sourceGraphics += spans.length;
      for (let i = 0; i < spans.length; i++) {
        if ((i & 511) === 0) {
          const pending = pause();
          if (pending) await pending;
        }
        const span = spans[i],
          node = expressions.read(span),
          layer = kiCadAtom(required(node, "layer"));
        const edge = layer === "Edge.Cuts";
        if (edge) edgeGraphics++;
        let drawing: BoardDrawing | undefined;
        if (!edge) {
          let layerId = drawingIds.get(layer);
          if (layerId === undefined) {
            layerId = 0x20000 + drawingLayers.length;
            drawingIds.set(layer, layerId);
            drawingLayers.push({
              id: layerId,
              name: layer,
              color: "#90a7b9",
              layerFunction: "unknown",
              defaultVisible: true,
            });
          }
          const id = 0x68000000 + drawings.length;
          drawing = {
            id,
            layer: layerId,
            net: 0,
            graphicIds: [id],
            segments: [],
            texts: [],
          };
          drawings.push(drawing);
        }
        const fill = kiCadChild(node, "fill");
        if (fill && ["yes", "solid"].includes(kiCadAtom(fill)))
          filledGraphics++;
        const stroke = kiCadChild(node, "stroke"),
          width = stroke
            ? kiCadNumber(required(stroke, "width"))
            : kiCadChild(node, "width")
              ? kiCadNumber(required(node, "width"))
              : 0;
        if (kind === "gr_line")
          push(
            point(required(node, "start")),
            point(required(node, "end")),
            width,
            drawing,
          );
        else if (kind === "gr_arc") {
          const a = point(required(node, "start")),
            m = point(required(node, "mid")),
            b = point(required(node, "end"));
          try {
            const arc = kiCadArcThrough(a, m, b);
            if (!arc) degenerateArcs++;
            push(a, b, width, drawing, arc);
          } catch (error) {
            throw new Error(`KiCad 图形圆弧 @${span.start}: ${String(error)}`);
          }
        } else if (kind === "gr_rect") {
          const a = point(required(node, "start")),
            b = point(required(node, "end"));
          const corners: Point[] = [a, [b[0], a[1]], b, [a[0], b[1]]];
          for (let j = 0; j < 4; j++)
            push(corners[j], corners[(j + 1) % 4], width, drawing);
        } else if (kind === "gr_poly") {
          let first: Point | undefined,
            last: Point | undefined,
            edges = 0;
          for (const value of required(node, "pts").values) {
            if (typeof value === "string")
              throw new Error(`KiCad 图形多边形顶点无效 @${span.start}`);
            if (value.head === "xy") {
              const vertex = point(value);
              if (
                last &&
                Math.hypot(vertex[0] - last[0], vertex[1] - last[1]) > 1e-12
              ) {
                push(last, vertex, width, drawing);
                edges++;
              }
              first ??= vertex;
              last = vertex;
            } else if (value.head === "arc") {
              const a = point(required(value, "start")),
                m = point(required(value, "mid")),
                b = point(required(value, "end"));
              if (last && Math.hypot(a[0] - last[0], a[1] - last[1]) > 1e-12) {
                push(last, a, width, drawing);
                edges++;
              }
              first ??= a;
              try {
                const arc = kiCadArcThrough(a, m, b);
                if (!arc) degenerateArcs++;
                push(a, b, width, drawing, arc);
                edges++;
              } catch (error) {
                throw new Error(
                  `KiCad 图形多边形圆弧 @${span.start}: ${String(error)}`,
                );
              }
              last = b;
            } else
              throw new Error(
                `KiCad 图形多边形节点未支持 ${value.head} @${span.start}`,
              );
          }
          if (!first || !last || edges < 1)
            throw new Error(`KiCad 图形多边形点数不足 @${span.start}`);
          if (Math.hypot(last[0] - first[0], last[1] - first[1]) > 1e-12)
            push(last, first, width, drawing);
        } else {
          const center = point(required(node, "center")),
            end = point(required(node, "end")),
            r = Math.hypot(end[0] - center[0], end[1] - center[1]);
          if (!(r > 0)) throw new Error(`KiCad 板框圆半径无效 @${span.start}`);
          const start = Math.atan2(end[1] - center[1], end[0] - center[0]);
          for (let j = 0; j < 4; j++) {
            const angle = start + (j * Math.PI) / 2,
              next = angle + Math.PI / 2;
            const a: Point = [
              center[0] + r * Math.cos(angle),
              center[1] + r * Math.sin(angle),
            ];
            const b: Point = [
              center[0] + r * Math.cos(next),
              center[1] + r * Math.sin(next),
            ];
            push(a, b, width, drawing, {
              center,
              radius: r,
              start: angle,
              sweep: Math.PI / 2,
            });
          }
        }
      }
    }
    return {
      outline,
      drawings,
      drawingLayers,
      bounds,
      sourceGraphics,
      edgeGraphics,
      filledGraphics,
      degenerateArcs,
    };
  }
}
/** Compatibility entry point; parsing state belongs to KiCadOutlineBuilder. */
export async function buildKiCadOutline(
  index: KiCadBoardIndex,
  signal?: AbortSignal,
): Promise<KiCadOutlineModel> {
  return new KiCadOutlineBuilder(index).build(signal);
}
