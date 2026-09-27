import type { Bounds, Point, Zone } from "../model";
import { PathShape } from "./path";
import { PolygonShape } from "./polygon";
import { SegmentShape } from "./segment";
import { LineShape } from "./line";
/** Format-independent zone shape; coordinates are in board space. */
export class ZoneShape {
  constructor(readonly data: Zone) {}
  private static readonly cachedBounds = new WeakMap<Zone, Bounds>();
  ringCount() {
    const zone = this.data;
    return zone.ringOffsets
      ? zone.ringOffsets.length - 1
      : zone.paths.length || zone.rings.length;
  }
  /** Read-only interleaved polygon coordinates. Compact meshes return a view,
   * so rendering and picking do not recreate retained Segment/Point objects. */
  ringCoordinates(index: number): Float64Array {
    const zone = this.data;
    if (zone.ringOffsets)
      return zone.points.subarray(
        zone.ringOffsets[index] * 2,
        zone.ringOffsets[index + 1] * 2,
      );
    return new Float64Array((zone.rings[index] ?? []).flat());
  }
  /** Whether the outgoing edge of a retained vertex is a physical boundary. */
  isBoundaryEdge(vertex: number): boolean {
    const breaks = this.data.boundaryBreaks;
    if (!breaks?.length) return true;
    let low = 0,
      high = breaks.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (breaks[middle] < vertex) low = middle + 1;
      else high = middle;
    }
    return breaks[low] !== vertex;
  }
  bounds(): Bounds {
    const zone = this.data;
    let bounds = ZoneShape.cachedBounds.get(zone);
    if (bounds) return bounds;
    if (zone.paths[0]?.length) {
      bounds = new PathShape(zone.paths[0]).bounds();
      ZoneShape.cachedBounds.set(zone, bounds);
      return bounds;
    }
    bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    const include = (x: number, y: number) => {
      bounds!.minX = Math.min(bounds!.minX, x);
      bounds!.minY = Math.min(bounds!.minY, y);
      bounds!.maxX = Math.max(bounds!.maxX, x);
      bounds!.maxY = Math.max(bounds!.maxY, y);
    };
    if (zone.ringOffsets) {
      for (let i = 0; i < zone.ringOffsets[1]; i++)
        include(zone.points[i * 2], zone.points[i * 2 + 1]);
    } else for (const p of zone.rings[0] ?? []) include(...p);
    ZoneShape.cachedBounds.set(zone, bounds);
    return bounds;
  }
  /** Query the retained typed coordinates without recreating millions of tuples. */
  contains(point: Point) {
    const zone = this.data;
    if (zone.paths.length) {
      if (!new PathShape(zone.paths[0]).contains(point)) return false;
      const view = {
        minX: point[0],
        maxX: point[0],
        minY: point[1],
        maxY: point[1],
      };
      for (const i of this.holeCandidates(view))
        if (new PathShape(zone.paths[i]).contains(point)) return false;
      return true;
    }
    const offsets = zone.ringOffsets;
    if (!offsets) return new PolygonShape(zone.rings).contains(point);
    const inside = (start: number, end: number) => {
      let hit = false;
      const p = zone.points;
      for (let i = start, j = end - 1; i < end; j = i++) {
        const ax = p[i * 2],
          ay = p[i * 2 + 1],
          bx = p[j * 2],
          by = p[j * 2 + 1];
        if (
          ay > point[1] !== by > point[1] &&
          point[0] < ((bx - ax) * (point[1] - ay)) / (by - ay) + ax
        )
          hit = !hit;
      }
      return hit;
    };
    if (offsets.length < 2 || !inside(offsets[0], offsets[1])) return false;
    for (let i = 1; i + 1 < offsets.length; i++)
      if (inside(offsets[i], offsets[i + 1])) return false;
    return true;
  }
  /** Shared analytic-contour candidates for deep rendering and exact picking. */
  *holeCandidates(view: Bounds): Generator<number> {
    const zone = this.data;
    const overlaps = (b: Bounds) =>
      b.minX <= view.maxX &&
      b.maxX >= view.minX &&
      b.minY <= view.maxY &&
      b.maxY >= view.minY;
    const visible = (i: number) => {
      if (!zone.ringBounds) return true;
      const b = zone.ringBounds,
        offset = i * 4;
      return (
        b[offset] <= view.maxX &&
        b[offset + 2] >= view.minX &&
        b[offset + 1] <= view.maxY &&
        b[offset + 3] >= view.minY
      );
    };
    if (
      zone.ringOrder &&
      zone.holeChunks?.every(
        (c) => c.ringStart !== undefined && c.ringCount !== undefined,
      )
    ) {
      for (const chunk of zone.holeChunks)
        if (overlaps(chunk.bounds)) {
          for (
            let p = chunk.ringStart!;
            p < chunk.ringStart! + chunk.ringCount!;
            p++
          ) {
            const i = zone.ringOrder[p];
            if (visible(i)) yield i;
          }
        }
    } else for (let i = 1; i < this.ringCount(); i++) if (visible(i)) yield i;
  }
  /** Exact existing boundary metric within a picking radius. Distant holes cannot
   * win the hit test; retain the outer path and use the shared contour bounds. */
  boundaryDistance(point: Point, radius: number): number {
    const zone = this.data;
    if (!zone.paths.length && !zone.ringOffsets && !zone.boundaryBreaks)
      return new PolygonShape(zone.rings).distance(point);
    const view = {
      minX: point[0] - radius,
      maxX: point[0] + radius,
      minY: point[1] - radius,
      maxY: point[1] + radius,
    };
    let distance = Infinity;
    const inspect = (index: number) => {
      if (zone.paths.length) {
        for (const edge of zone.paths[index])
          distance = Math.min(distance, new SegmentShape(edge).distance(point));
      } else {
        const ring = this.ringCoordinates(index),
          a: Point = [0, 0],
          b: Point = [0, 0];
        const edge = new LineShape(a, b);
        const offset =
          zone.ringOffsets?.[index] ??
          zone.rings
            .slice(0, index)
            .reduce((sum, value) => sum + value.length, 0);
        for (let i = 0; i < ring.length; i += 2) {
          if (!this.isBoundaryEdge(offset + i / 2)) continue;
          const next = (i + 2) % ring.length;
          a[0] = ring[i];
          a[1] = ring[i + 1];
          b[0] = ring[next];
          b[1] = ring[next + 1];
          distance = Math.min(distance, edge.distance(point));
        }
      }
    };
    inspect(0);
    for (const index of this.holeCandidates(view)) inspect(index);
    return distance <= radius ? distance : Infinity;
  }
}
