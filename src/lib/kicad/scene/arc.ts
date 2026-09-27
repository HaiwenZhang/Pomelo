import type { Point } from "../../board/model";
import type { Segment } from "../../board/model";
/** Reconstruct KiCad's start/mid/end arc after coordinates have been mapped to
 * the scene. Exact source-grid collinearity is a straight stroke. */
export function kiCadArcThrough(
  a: Point,
  m: Point,
  b: Point,
): Segment["arc"] | undefined {
  const mx = m[0] - a[0],
    my = m[1] - a[1],
    bx = b[0] - a[0],
    by = b[1] - a[1];
  const cross = mx * by - my * bx,
    spanLength = Math.hypot(bx, by),
    det = 2 * cross;
  if (spanLength === 0) {
    const radius = Math.hypot(mx, my) / 2;
    if (!(radius > 0)) throw new Error("KiCad 圆弧起点、中点和终点重合");
    const center: Point = [(a[0] + m[0]) / 2, (a[1] + m[1]) / 2];
    return {
      center,
      radius,
      start: Math.atan2(a[1] - center[1], a[0] - center[0]),
      sweep: Math.PI * 2,
    };
  }
  if (spanLength > 0 && Math.abs(cross) / spanLength <= 1e-9) {
    const projection = mx * bx + my * by,
      span = bx * bx + by * by;
    if (projection >= -1e-12 && projection <= span + 1e-12) return undefined;
    throw new Error("KiCad 退化圆弧的中点不在端点之间");
  }
  if (!Number.isFinite(det)) throw new Error("KiCad 圆弧行列式无效");
  const mm = mx * mx + my * my,
    bb = bx * bx + by * by,
    center: Point = [
      a[0] + (mm * by - bb * my) / det,
      a[1] + (bb * mx - mm * bx) / det,
    ];
  const radius = Math.hypot(a[0] - center[0], a[1] - center[1]),
    start = Math.atan2(a[1] - center[1], a[0] - center[0]);
  const positive = (angle: number) =>
    ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const ccw = positive(Math.atan2(b[1] - center[1], b[0] - center[0]) - start),
    mid = positive(Math.atan2(m[1] - center[1], m[0] - center[0]) - start);
  const sweep = mid <= ccw + 1e-9 ? ccw : ccw - Math.PI * 2;
  if (!(radius > 0) || !Number.isFinite(radius) || Math.abs(sweep) < 1e-9)
    throw new Error("KiCad 圆弧半径或扫角无效");
  return { center, radius, start, sweep };
}
