import type { Point } from "../model";
/** Format-independent line shape; coordinates are in board space. */
export class LineShape {
  constructor(
    readonly a: Point,
    readonly b: Point,
  ) {}
  distance(point: Point): number {
    const a = this.a;
    const b = this.b;
    const dx = b[0] - a[0],
      dy = b[1] - a[1],
      length = dx * dx + dy * dy;
    const t = length
      ? Math.max(
          0,
          Math.min(
            1,
            ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / length,
          ),
        )
      : 0;
    return Math.hypot(point[0] - a[0] - dx * t, point[1] - a[1] - dy * t);
  }
}
