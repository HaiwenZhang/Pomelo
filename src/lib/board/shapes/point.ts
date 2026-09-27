import type { Point } from "../model";
/** Format-independent point shape; coordinates are in board space. */
export class PointShape {
  constructor(readonly data: Point) {}
  rotate(angle: number): Point {
    const p = this.data;
    const c = Math.cos(angle),
      s = Math.sin(angle);
    return [c * p[0] - s * p[1], s * p[0] + c * p[1]];
  }
  place(origin: Point, angle: number, back: boolean): Point {
    const p = this.data;
    const q = new PointShape([back ? -p[0] : p[0], p[1]]).rotate(angle);
    return [q[0] + origin[0], q[1] + origin[1]];
  }
}
