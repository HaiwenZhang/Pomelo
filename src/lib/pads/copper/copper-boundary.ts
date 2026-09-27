import type { Segment } from "../../board/model";
import type { Point } from "../../board/model";
import type { PadsCopperContour } from "./copper";
export function isPadsCircularContour(path: Segment[]): boolean {
  const first = path[0]?.arc;
  const validPoint = (p: Point) => p.every(Number.isFinite);
  return (
    !!first &&
    first.radius > 0 &&
    Number.isFinite(first.radius) &&
    validPoint(first.center) &&
    path.every((s, i) => {
      const a = s.arc;
      if (
        !a ||
        !validPoint(s.a) ||
        !validPoint(s.b) ||
        !validPoint(a.center) ||
        !Number.isFinite(a.start) ||
        !Number.isFinite(a.sweep)
      )
        return false;
      const radiusError = Math.max(
        Math.abs(
          Math.hypot(s.a[0] - a.center[0], s.a[1] - a.center[1]) - a.radius,
        ),
        Math.abs(
          Math.hypot(s.b[0] - a.center[0], s.b[1] - a.center[1]) - a.radius,
        ),
      );
      const expectedA: Point = [
        a.center[0] + a.radius * Math.cos(a.start),
        a.center[1] + a.radius * Math.sin(a.start),
      ];
      const expectedB: Point = [
        a.center[0] + a.radius * Math.cos(a.start + a.sweep),
        a.center[1] + a.radius * Math.sin(a.start + a.sweep),
      ];
      return (
        Math.hypot(
          a.center[0] - first.center[0],
          a.center[1] - first.center[1],
        ) < 1e-8 &&
        Math.abs(a.radius - first.radius) < 1e-8 &&
        radiusError < 1e-8 &&
        Math.hypot(s.a[0] - expectedA[0], s.a[1] - expectedA[1]) < 1e-8 &&
        Math.hypot(s.b[0] - expectedB[0], s.b[1] - expectedB[1]) < 1e-8 &&
        Math.hypot(
          s.b[0] - path[(i + 1) % path.length].a[0],
          s.b[1] - path[(i + 1) % path.length].a[1],
        ) < 1e-8
      );
    }) &&
    Math.abs(
      Math.abs(path.reduce((n, s) => n + s.arc!.sweep, 0)) - 2 * Math.PI,
    ) < 1e-8
  );
}
/** Geometric circular offset only. Export-specific clearance changes remain
 * unresolved and must not be inferred from this half-width candidate. */
export function offsetPadsCircularContour(
  contour: PadsCopperContour,
  distance: number,
): Segment[] | null {
  if (
    !Number.isFinite(contour.width) ||
    contour.width < 0 ||
    !Number.isFinite(distance)
  )
    throw new Error("PADS 铜区描边宽度无效");
  if (!isPadsCircularContour(contour.path))
    throw new Error("PADS 非圆形轮廓需要独立偏移");
  const radius = contour.path[0].arc!.radius + distance;
  if (radius <= 0) return null;
  return contour.path.map((s) => {
    const arc = s.arc!,
      point = (p: Point): Point => {
        const a = Math.atan2(p[1] - arc.center[1], p[0] - arc.center[0]);
        return [
          arc.center[0] + radius * Math.cos(a),
          arc.center[1] + radius * Math.sin(a),
        ];
      };
    return {
      ...s,
      width: 0,
      a: point(s.a),
      b: point(s.b),
      arc: { ...arc, radius },
    };
  });
}
/** Saved circular void: candidate copper boundary is half a stroke inward. */
export function insetPadsCircularHole(
  contour: PadsCopperContour,
): Segment[] | null {
  return offsetPadsCircularContour(contour, -contour.width / 2);
}
