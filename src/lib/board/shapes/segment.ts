import type { Bounds, Point, Segment } from "../model";
import { ArcShape } from "./arc";
import { LineShape } from "./line";
/** Format-independent segment shape; coordinates are in board space. */
export class SegmentShape {
  static fromPoints(
    a: Point,
    b: Point,
    width = 0,
    center?: Point,
    clockwise = false,
  ): Segment {
    const s: Segment = { id: 0, trackId: 0, layer: 0, net: 0, a, b, width };
    if (center) {
      const start = Math.atan2(a[1] - center[1], a[0] - center[0]);
      s.arc = {
        center,
        radius: Math.hypot(a[0] - center[0], a[1] - center[1]),
        start,
        sweep: ArcShape.sweep(
          start,
          Math.atan2(b[1] - center[1], b[0] - center[0]),
          clockwise,
        ),
      };
    }
    return s;
  }

  constructor(readonly data: Segment) {}
  distance(point: Point): number {
    const segment = this.data;
    if (!segment.arc)
      return new LineShape(segment.a, segment.b).distance(point);
    const { center, radius, start, sweep } = segment.arc,
      angle = Math.atan2(point[1] - center[1], point[0] - center[0]);
    const tau = 2 * Math.PI,
      directed = (angle - start) * Math.sign(sweep),
      delta = ((directed % tau) + tau) % tau;
    if (delta <= Math.abs(sweep) + 1e-12)
      return Math.abs(
        Math.hypot(point[0] - center[0], point[1] - center[1]) - radius,
      );
    return Math.min(
      Math.hypot(point[0] - segment.a[0], point[1] - segment.a[1]),
      Math.hypot(point[0] - segment.b[0], point[1] - segment.b[1]),
    );
  }
  /** Bounds of the directed arc, not its complete supporting circle. Includes
   * round caps and both stored endpoints (which may have coordinate rounding). */
  bounds(out?: Bounds): Bounds {
    const segment = this.data;
    const { a, b, arc } = segment,
      r = Math.max(0, segment.width) / 2;
    let minX = Math.min(a[0], b[0]),
      maxX = Math.max(a[0], b[0]);
    let minY = Math.min(a[1], b[1]),
      maxY = Math.max(a[1], b[1]);
    if (arc) {
      const tau = Math.PI * 2;
      // Visit endpoints first, then the same four extrema, without a closure per
      // arc. Callers preparing large batches may supply a private scratch result.
      for (let candidate = -2; candidate < 4; candidate++) {
        const angle =
          candidate === -2
            ? arc.start
            : candidate === -1
              ? arc.start + arc.sweep
              : (candidate * Math.PI) / 2;
        if (candidate >= 0) {
          const travel =
            ((((angle - arc.start) * Math.sign(arc.sweep)) % tau) + tau) % tau;
          if (!(
            Math.abs(arc.sweep) >= tau || travel <= Math.abs(arc.sweep) + 1e-12
          ))
            continue;
        }
        const x = arc.center[0] + arc.radius * Math.cos(angle),
          y = arc.center[1] + arc.radius * Math.sin(angle);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
    if (!out)
      return { minX: minX - r, minY: minY - r, maxX: maxX + r, maxY: maxY + r };
    out.minX = minX - r;
    out.minY = minY - r;
    out.maxX = maxX + r;
    out.maxY = maxY + r;
    return out;
  }
  displayCategory(): "etch" | "bond-wire" {
    const segment = this.data;
    return segment.bondWire ? "bond-wire" : "etch";
  }
}
