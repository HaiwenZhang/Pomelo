import earcut from "earcut";
import type { Point } from "../model";
import { LineShape } from "./line";
/** Format-independent polygon shape; coordinates are in board space. */
export class PolygonShape {
  constructor(readonly data: Point[][]) {}
  /** Weakly simple polygons can encode holes with an out-and-back bridge.
   * Preserve the fill coordinates and exclude only paired reverse edges from
   * boundary drawing/picking. Same-direction coincident edges do not cancel. */
  bridgeEdges(): Uint32Array {
    const excluded: number[] = [];
    let offset = 0;
    for (const ring of this.data) {
      const pending = new Map<string, number[]>();
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length],
          index = offset + i;
        if (a[0] === b[0] && a[1] === b[1]) {
          excluded.push(index);
          continue;
        }
        const start = `${a[0]},${a[1]}`,
          end = `${b[0]},${b[1]}`;
        const reverse = pending.get(`${end}|${start}`);
        if (reverse?.length) excluded.push(reverse.pop()!, index);
        else {
          const key = `${start}|${end}`,
            indices = pending.get(key) ?? [];
          indices.push(index);
          pending.set(key, indices);
        }
      }
      offset += ring.length;
    }
    return new Uint32Array(excluded.sort((a, b) => a - b));
  }
  static containsRing(point: Point, ring: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (
        a[1] > point[1] !== b[1] > point[1] &&
        point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
    return inside;
  }
  contains(point: Point) {
    const rings = this.data;
    return (
      !!rings.length &&
      PolygonShape.containsRing(point, rings[0]) &&
      !rings.slice(1).some((ring) => PolygonShape.containsRing(point, ring))
    );
  }
  distance(point: Point) {
    const rings = this.data;
    let distance = Infinity;
    for (const ring of rings)
      for (let i = 0; i < ring.length; i++)
        distance = Math.min(
          distance,
          new LineShape(ring[i], ring[(i + 1) % ring.length]).distance(point),
        );
    return distance;
  }
  triangulate() {
    const rings = this.data;
    const points: number[] = [],
      holes: number[] = [];
    for (const [index, ring] of rings.entries()) {
      if (index) holes.push(points.length / 2);
      for (const p of ring) points.push(...p);
    }
    return {
      points: new Float64Array(points),
      indices: new Uint32Array(earcut(points, holes, 2)),
    };
  }
}
