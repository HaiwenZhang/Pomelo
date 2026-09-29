import type { Bounds, Point, Segment } from "../board/model";
import { ArcShape } from "../board/shapes/arc";

import { boundsOverlap } from "./view-culling";

/** Chord error is bounded only where the arc's monotone bounding box intersects
 * the requested view. Coarse chords wholly outside it cannot change coverage
 * inside. This avoids subdividing an entire large circle at microscope scale. */
export function tessellateCurveRing(
  path: Segment[],
  view: Bounds,
  tolerance: number,
): Point[] {
  if (!(tolerance > 0) || !Number.isFinite(tolerance))
    throw Error("Invalid curve tolerance");
  const points: Point[] = [];
  const push = (point: Point) => {
    const last = points.at(-1);
    if (!last || point[0] !== last[0] || point[1] !== last[1])
      points.push(point);
  };
  for (const edge of path) {
    push(edge.a);
    if (edge.arc) {
      const arc = edge.arc,
        angles = new ArcShape(arc).intervals();
      const refine = (
        start: number,
        end: number,
        a: Point,
        b: Point,
        depth: number,
      ) => {
        const box = {
          minX: Math.min(a[0], b[0]),
          maxX: Math.max(a[0], b[0]),
          minY: Math.min(a[1], b[1]),
          maxY: Math.max(a[1], b[1]),
        };
        const error = 2 * arc.radius * Math.sin((end - start) / 4) ** 2;
        const mid = (start + end) / 2;
        if (
          error > tolerance &&
          depth < 52 &&
          mid !== start &&
          mid !== end &&
          boundsOverlap(box, view)
        ) {
          const m = new ArcShape(arc).point(mid);
          refine(start, mid, a, m, depth + 1);
          refine(mid, end, m, b, depth + 1);
        } else push(b);
      };
      push(new ArcShape(arc).point(angles[0]));
      for (let i = 1; i < angles.length; i++)
        refine(
          angles[i - 1],
          angles[i],
          new ArcShape(arc).point(angles[i - 1]),
          new ArcShape(arc).point(angles[i]),
          0,
        );
    }
    push(edge.b);
  }
  return clipRing(points, view);
}

/** Clip in CPU doubles before float32 GPU conversion. The resulting contour may
 * connect disjoint pieces along the clip boundary; parity fans retain their
 * coverage without asking a simple-polygon triangulator to repair topology. */
export function clipRing(input: Point[], view: Bounds): Point[] {
  let points = input;
  for (const [axis, bound, sign] of [
    [0, view.minX, 1],
    [0, view.maxX, -1],
    [1, view.minY, 1],
    [1, view.maxY, -1],
  ]) {
    if (!points.length) break;
    const output: Point[] = [];
    let a = points[points.length - 1],
      insideA = (a[axis] - bound) * sign >= 0;
    for (const b of points) {
      const insideB = (b[axis] - bound) * sign >= 0;
      if (insideA !== insideB) {
        const t = (bound - a[axis]) / (b[axis] - a[axis]);
        const p: Point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        p[axis] = bound;
        output.push(p);
      }
      if (insideB) output.push(b);
      a = b;
      insideA = insideB;
    }
    points = output;
  }
  return points;
}
