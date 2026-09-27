import type { Point, Segment } from "../model";

/** Placement of local geometry: mirror local Y, rotate counterclockwise, then
 * translate. The transform retains analytic arcs and their directed sweep. */
export class ShapeTransform {
  private readonly cosine: number;
  private readonly sine: number;

  constructor(
    private readonly origin: Point,
    angle: number,
    private readonly mirrorY = false,
  ) {
    this.cosine = Math.cos(angle);
    this.sine = Math.sin(angle);
  }

  point(point: Point): Point {
    const x = point[0],
      y = this.mirrorY ? -point[1] : point[1];
    return [
      this.cosine * x - this.sine * y + this.origin[0],
      this.sine * x + this.cosine * y + this.origin[1],
    ];
  }

  segment(segment: Segment): Segment {
    const a = this.point(segment.a),
      b = this.point(segment.b);
    if (!segment.arc) return { ...segment, a, b };
    const center = this.point(segment.arc.center);
    return {
      ...segment,
      a,
      b,
      arc: {
        ...segment.arc,
        center,
        start: Math.atan2(a[1] - center[1], a[0] - center[0]),
        sweep: segment.arc.sweep * (this.mirrorY ? -1 : 1),
      },
    };
  }
}
