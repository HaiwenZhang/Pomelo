import { completeSteps } from "../../iteration";
import type { Bounds, Point, Segment } from "../model";
import { ArcShape } from "./arc";
import { SegmentShape } from "./segment";
/** Format-independent path shape; coordinates are in board space. */
export class PathShape {
  constructor(readonly data: Segment[]) {}
  // Keep analytic edges alongside this mesh. The mesh tolerance is a world-space
  // approximation for copper fill; outlines and tracks remain analytic on the GPU.
  flatten(tolerance = 0.00025): Point[] {
    return completeSteps(this.flattenSteps(tolerance));
  }
  *flattenSteps(tolerance = 0.00025): Generator<void, Point[]> {
    const path = this.data;
    const points: Point[] = [];
    let work = 0;
    const add = (p: Point) => {
      const last = points.at(-1);
      if (!last || Math.hypot(last[0] - p[0], last[1] - p[1]) > 1e-9)
        points.push(p);
    };
    for (const s of path) {
      add(s.a);
      if (s.arc) {
        const { center, radius, start, sweep } = s.arc;
        const step =
          2 *
          Math.acos(
            Math.max(
              -1,
              Math.min(1, 1 - tolerance / Math.max(radius, tolerance)),
            ),
          );
        const count = Math.max(
          2,
          Math.ceil(Math.abs(sweep) / Math.max(step, 1e-5)),
        );
        for (let i = 1; i < count; i++) {
          const a = start + (sweep * i) / count;
          add([
            center[0] + radius * Math.cos(a),
            center[1] + radius * Math.sin(a),
          ]);
          if ((++work & 1023) === 0) yield;
        }
      }
      add(s.b);
      if ((++work & 255) === 0) yield;
    }
    if (
      points.length > 1 &&
      Math.hypot(
        points[0][0] - points.at(-1)![0],
        points[0][1] - points.at(-1)![1],
      ) < 1e-9
    )
      points.pop();
    return points;
  }
  bounds(): Bounds {
    const path = this.data;
    const result = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    for (const edge of path) {
      const b = new SegmentShape({ ...edge, width: 0 }).bounds();
      result.minX = Math.min(result.minX, b.minX);
      result.maxX = Math.max(result.maxX, b.maxX);
      result.minY = Math.min(result.minY, b.minY);
      result.maxY = Math.max(result.maxY, b.maxY);
    }
    return result;
  }
  /** Even/odd within ONE contour. Zone holes must be subtracted as a union.
   * Keep endpoint connectors: file precision can put a stored endpoint slightly
   * off its supporting circle. The renderer uses these same connectors. */
  contains(point: Point): boolean {
    const path = this.data;
    if (!path.length) return false;
    let hit = false,
      previous = path[0].a;
    const line = (a: Point, b: Point) => {
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < a[0] + (b[0] - a[0]) * ((point[1] - a[1]) / (b[1] - a[1]))
      )
        hit = !hit;
    };
    for (const edge of path) {
      line(previous, edge.a);
      if (!edge.arc) line(edge.a, edge.b);
      else {
        const arc = edge.arc,
          angles = new ArcShape(arc).intervals();
        let a = new ArcShape(arc).point(angles[0]);
        line(edge.a, a);
        for (let i = 1; i < angles.length; i++) {
          const b = new ArcShape(arc).point(angles[i]);
          if (a[1] > point[1] !== b[1] > point[1]) {
            const dy = point[1] - arc.center[1];
            const x =
              arc.center[0] +
              Math.sign(Math.cos((angles[i - 1] + angles[i]) / 2)) *
                Math.sqrt(Math.max(0, (arc.radius - dy) * (arc.radius + dy)));
            if (point[0] < x) hit = !hit;
          }
          a = b;
        }
        line(a, edge.b);
      }
      previous = edge.b;
    }
    line(previous, path[0].a);
    return hit;
  }
}
