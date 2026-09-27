import { EndType, inflatePathsD, JoinType } from "clipper2-ts";
import type { Point } from "../../board/model";
import { PathShape } from "../../board/shapes/path";
import type { PadsCopperContour } from "./copper";
/** Offset one saved stroke centerline. The caller still owns fill/void and
 * thermal semantics; this returns polygonal boundary candidates only. */
export function offsetPadsCopperContour(
  contour: PadsCopperContour,
  side: "outer" | "hole",
  tolerance = 0.000025,
): Point[][] {
  if (
    !Number.isFinite(contour.width) ||
    contour.width < 0 ||
    !Number.isFinite(tolerance) ||
    tolerance <= 0
  )
    throw new Error("PADS 铜区轮廓宽度或精度无效");
  if (!contour.path.length) throw new Error("PADS 铜区轮廓为空");
  const first = contour.path[0].a,
    last = contour.path.at(-1)!.b;
  if (Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-7)
    throw new Error("PADS 铜区轮廓未闭合");
  const ring = new PathShape(contour.path).flatten(tolerance);
  if (ring.some((p) => !p.every(Number.isFinite)))
    throw new Error("PADS 铜区轮廓顶点无效");
  // A zero-area saved void has no interior to retain after contraction. Actual
  // cases store A-B-A with width much greater than the tiny A-B span.
  if (ring.length < 3) {
    if (
      side === "hole" &&
      ring.length === 2 &&
      Math.hypot(ring[0][0] - ring[1][0], ring[0][1] - ring[1][1]) <
        contour.width / 2
    )
      return [];
    throw new Error("PADS 铜区轮廓顶点无效");
  }
  if (contour.width === 0) return [ring];
  const delta = ((side === "outer" ? 1 : -1) * contour.width) / 2;
  const offset = inflatePathsD(
    [ring.map(([x, y]) => ({ x, y }))],
    delta,
    JoinType.Round,
    EndType.Polygon,
    2,
    6,
    tolerance,
  );
  return offset
    .map((path) => path.map((p) => [p.x, p.y] as Point))
    .filter(
      (path) => path.length >= 3 && path.every((p) => p.every(Number.isFinite)),
    );
}
