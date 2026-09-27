import type { Point, Segment } from "../model";
type Arc = NonNullable<Segment["arc"]>;
/** Format-independent arc shape; coordinates are in board space. */
export class ArcShape {
  constructor(readonly data: Arc) {}
  static sweep(start: number, end: number, clockwise: boolean) {
    let d = end - start;
    if (clockwise) {
      while (d >= 0) d -= Math.PI * 2;
    } else {
      while (d <= 0) d += Math.PI * 2;
    }
    return d;
  }
  point(angle: number): Point {
    const arc = this.data;
    return [
      arc.center[0] + arc.radius * Math.cos(angle),
      arc.center[1] + arc.radius * Math.sin(angle),
    ];
  }
  /** Split at cardinal angles: each interval is monotone in both coordinates. */
  intervals(): number[] {
    const arc = this.data;
    const { start, sweep } = arc,
      end = start + sweep,
      step = Math.PI / 2;
    const angles = [start];
    if (sweep > 0) {
      for (let k = Math.floor(start / step) + 1; k * step < end; k++)
        angles.push(k * step);
    } else {
      for (let k = Math.ceil(start / step) - 1; k * step > end; k--)
        angles.push(k * step);
    }
    angles.push(end);
    return angles;
  }
}
