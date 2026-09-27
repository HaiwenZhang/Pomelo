import type { Point, Segment } from "../../board/model";
import { ArcShape } from "../../board/shapes/arc";
import type { readPadsPours } from "../binary/pours";
export type PadsPourGeometryPiece = Pick<
  Awaited<ReturnType<typeof readPadsPours>>["pieces"][number],
  "owner" | "index" | "type" | "width" | "points" | "arcs"
>;
/** Geometry only. Callers must supply the verified scene layer/net and apply
 * the owner fill/void relationship; a boundary is not automatically copper. */
export function padsPourGeometry(
  piece: PadsPourGeometryPiece,
  layer: number,
  net: number,
): {
  kind: "contour" | "strokes";
  path: Segment[];
} {
  const { points, arcs } = piece;
  const segment = (a: Point, b: Point): Segment => ({
    id: piece.index,
    trackId: piece.owner,
    layer,
    net,
    a,
    b,
    width: 0,
  });
  if (piece.type === 51) {
    if (points.length !== 2 || arcs.length)
      throw new Error("PADS 圆形铜区端点无效");
    const [a, b] = points,
      center: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
      radius = Math.hypot(a[0] - b[0], a[1] - b[1]) / 2;
    if (!(radius > 0)) throw new Error("PADS 圆形铜区半径无效");
    const start = Math.atan2(a[1] - center[1], a[0] - center[0]);
    return {
      kind: "contour",
      path: [
        { ...segment(a, b), arc: { center, radius, start, sweep: Math.PI } },
        {
          ...segment(b, a),
          arc: { center, radius, start: start + Math.PI, sweep: Math.PI },
        },
      ],
    };
  }
  if (piece.type !== 50 && piece.type !== 52)
    throw new Error(`PADS 铜区分段类型 ${piece.type} 尚待核验`);
  const strokes = piece.type === 52;
  if (strokes && (points.length % 2 || arcs.length))
    throw new Error("PADS 铜区线段坐标配对无效");
  const byVertex = new Map(arcs.map((a) => [a.vertexIndex, a])),
    path: Segment[] = [];
  for (let i = 0; i < points.length - 1; i += strokes ? 2 : 1) {
    const a = points[i],
      b = points[i + 1],
      s = segment(a, b),
      arc = byVertex.get(i);
    if (strokes) s.width = piece.width;
    if (arc) {
      const center = arc.center,
        start = Math.atan2(a[1] - center[1], a[0] - center[0]),
        end = Math.atan2(b[1] - center[1], b[0] - center[0]);
      const radius = Math.hypot(a[0] - center[0], a[1] - center[1]);
      if (!(radius > 0) || Math.abs(arc.sweepTenths) > 3600)
        throw new Error("PADS 铜区圆弧参数无效");
      // The signed 0.1-degree field can quantize tiny sweeps to zero. Recover
      // their direction from exact endpoints, never turn them into full circles.
      const tiny = Math.atan2(Math.sin(end - start), Math.cos(end - start));
      if (arc.sweepTenths === 0 && Math.abs(tiny) > Math.PI / 1800 + 1e-9)
        throw new Error("PADS 零扫角与端点不符");
      s.arc = {
        center,
        radius,
        start,
        sweep:
          arc.sweepTenths === 0
            ? tiny
            : ArcShape.sweep(start, end, arc.sweepTenths < 0),
      };
    }
    if (s.arc || a[0] !== b[0] || a[1] !== b[1]) path.push(s);
  }
  if (!strokes && points.length) {
    const a = points.at(-1)!,
      b = points[0];
    if (a[0] !== b[0] || a[1] !== b[1]) path.push(segment(a, b));
  }
  return { kind: strokes ? "strokes" : "contour", path };
}
