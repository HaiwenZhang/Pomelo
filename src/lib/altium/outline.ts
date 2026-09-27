import type { Bounds, Point, Segment } from "../board/model";
import { SegmentShape } from "../board/shapes/segment";
import {
  altiumProperty,
  type AltiumPropertiesRecord,
} from "./binary/properties";
export const altiumMil = (value: string | undefined, key: string) => {
  if (value === undefined) throw new Error(`Altium 缺少 ${key}`);
  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?)mil$/i.exec(
    value.trim(),
  );
  if (!match) throw new Error(`Altium ${key} 单位无效: ${value}`);
  const mm = Number(match[1]) * 0.0254;
  if (!Number.isFinite(mm)) throw new Error(`Altium ${key} 坐标无效`);
  return mm;
};
interface Vertex {
  point: Point;
  round: boolean;
  center: Point;
  radius: number;
  start: number;
  end: number;
}
export interface AltiumOutline {
  outline: Segment[];
  bounds: Bounds;
  sourceVertices: number;
  sourceArcs: number;
}
const same = (a: Point, b: Point) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-8;
/** Board6 VX/VY vertices describe the physical board edge. Curved vertices
 * supply a center, radius and two angles; VX/VY selects traversal direction. */
export class AltiumOutlineReader {
  constructor(private readonly board: AltiumPropertiesRecord) {}
  read(): AltiumOutline {
    const { board } = this;
    const vertices: Vertex[] = [];
    for (let i = 0; i < 100000; i++) {
      const x = altiumProperty(board, `VX${i}`),
        y = altiumProperty(board, `VY${i}`);
      if (x === undefined && y === undefined) break;
      if (x === undefined || y === undefined)
        throw new Error(`Altium 板框顶点 ${i} 坐标不完整`);
      const key = (part: string) => `${part}${i}`;
      const round = Number(altiumProperty(board, key("KIND")) ?? 0) !== 0;
      const center: Point = round
        ? [
            altiumMil(altiumProperty(board, key("CX")), key("CX")),
            -altiumMil(altiumProperty(board, key("CY")), key("CY")),
          ]
        : [0, 0];
      const radius = round
        ? altiumMil(altiumProperty(board, key("R")), key("R"))
        : 0;
      const start = round ? Number(altiumProperty(board, key("SA"))) : 0,
        end = round ? Number(altiumProperty(board, key("EA"))) : 0;
      if (round && (!(radius > 0) || ![start, end].every(Number.isFinite)))
        throw new Error(`Altium 板框圆弧 ${i} 无效`);
      vertices.push({
        point: [altiumMil(x, key("VX")), -altiumMil(y, key("VY"))],
        round,
        center,
        radius,
        start,
        end,
      });
    }
    if (vertices.length < 3) throw new Error("Altium 物理板框顶点不足");
    const outline: Segment[] = [],
      bounds: Bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
    let first: Point | undefined,
      last: Point | undefined,
      sourceArcs = 0;
    const push = (a: Point, b: Point, arc?: Segment["arc"]) => {
      const id = 0x6f000000 + outline.length,
        segment: Segment = {
          id,
          trackId: id,
          layer: 0,
          net: 0,
          a,
          b,
          width: 0.05,
        };
      if (arc) segment.arc = arc;
      outline.push(segment);
      const box = new SegmentShape(segment).bounds();
      bounds.minX = Math.min(bounds.minX, box.minX);
      bounds.minY = Math.min(bounds.minY, box.minY);
      bounds.maxX = Math.max(bounds.maxX, box.maxX);
      bounds.maxY = Math.max(bounds.maxY, box.maxY);
    };
    const connect = (to: Point) => {
      if (last && !same(last, to)) push(last, to);
      first ??= to;
      last = to;
    };
    for (const vertex of vertices) {
      if (!vertex.round) {
        connect(vertex.point);
        continue;
      }
      sourceArcs++;
      const angle = (degrees: number) => (degrees * Math.PI) / 180;
      const endpoint = (degrees: number): Point => [
        vertex.center[0] + vertex.radius * Math.cos(angle(degrees)),
        vertex.center[1] - vertex.radius * Math.sin(angle(degrees)),
      ];
      const a = endpoint(vertex.start),
        b = endpoint(vertex.end),
        span = (((vertex.end - vertex.start) % 360) + 360) % 360;
      const fromA =
        Math.hypot(a[0] - vertex.point[0], a[1] - vertex.point[1]) <
        Math.hypot(b[0] - vertex.point[0], b[1] - vertex.point[1]);
      const begin = fromA ? a : b,
        finish = fromA ? b : a;
      connect(begin);
      const sweep = (fromA ? -1 : 1) * angle(span || 360),
        start = Math.atan2(
          begin[1] - vertex.center[1],
          begin[0] - vertex.center[0],
        );
      push(begin, finish, {
        center: vertex.center,
        radius: vertex.radius,
        start,
        sweep,
      });
      last = finish;
    }
    if (first && last && !same(last, first)) push(last, first);
    return { outline, bounds, sourceVertices: vertices.length, sourceArcs };
  }
}
/** Compatibility entry point; parsing state belongs to AltiumOutlineReader. */
export function readAltiumOutline(
  board: AltiumPropertiesRecord,
): AltiumOutline {
  return new AltiumOutlineReader(board).read();
}
