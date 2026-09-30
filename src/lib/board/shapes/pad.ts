import type {
  Bounds,
  PadShape as PadData,
  Pin,
  Point,
  Segment,
  Via,
} from "../model";
import { PointShape } from "./point";
import { PolygonShape } from "./polygon";
import { SegmentShape } from "./segment";
export type PadOwner = Pin | Via;
export interface PadPlacement {
  at: Point;
  angle?: number;
  back?: boolean;
}
export const ANALYTIC_PAD_TYPES = [2, 3, 5, 6, 11, 12, 25, 27, 28] as const;
/** Format-independent pad shape; coordinates are in board space. */
export class PadShape {
  /** Local contours for imported circles, donuts, rectangles, oblongs and
   * rounded/chamfered rectangles. Callers validate that source shape family;
   * existing custom paths are retained without another approximation. */
  paths(): Segment[][] {
    const pad = this.data;
    if (pad.customPaths) return pad.customPaths;
    const w = pad.width / 2,
      h = pad.height / 2;
    if (pad.type === 2 || pad.type === 25) {
      const circle = (r: number) => [
        SegmentShape.fromPoints([r, 0], [r, 0], 0, [0, 0]),
      ];
      return pad.type === 25
        ? [circle(w), circle(pad.innerDiameter! / 2)]
        : [circle(w)];
    }
    const r = this.corner();
    const points: Point[] = [
      [w, h - r],
      [w - r, h],
      [-w + r, h],
      [-w, h - r],
      [-w, -h + r],
      [-w + r, -h],
      [w - r, -h],
      [w, -h + r],
    ];
    const centers: Point[] = [
      [w - r, h - r],
      [-w + r, h - r],
      [-w + r, -h + r],
      [w - r, -h + r],
    ];
    const path: Segment[] = [];
    for (let i = 0; i < 8; i++) {
      const a = points[i],
        b = points[(i + 1) % 8];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      path.push(
        SegmentShape.fromPoints(
          a,
          b,
          0,
          i % 2 === 0 && r > 0 && !this.chamfered()
            ? centers[i / 2]
            : undefined,
        ),
      );
    }
    return [path];
  }

  constructor(readonly data: PadData) {}
  private static readonly meshes = new WeakMap<
    Point[][],
    ReturnType<PolygonShape["triangulate"]>
  >();
  supported() {
    const pad = this.data;
    return (
      ANALYTIC_PAD_TYPES.some((type) => type === pad.type) ||
      !!pad.custom?.length
    );
  }
  corner(): number {
    const pad = this.data;
    const min = Math.min(pad.width, pad.height),
      stored = pad.corner ?? 0;
    return Math.min(
      min / 2,
      [11, 12].includes(pad.type)
        ? min / 2
        : [27, 28].includes(pad.type)
          ? stored > 0
            ? stored
            : min * 0.25
          : pad.type === 3
            ? min * (1 - 1 / Math.sqrt(2))
            : 0,
    );
  }
  chamfered(): boolean {
    return this.data.type === 3 || this.data.type === 28;
  }
  toWorld(point: Point, owner: PadPlacement): Point {
    const pad = this.data;
    const q = new PointShape([
      point[0],
      pad.custom && owner.back ? -point[1] : point[1],
    ]).rotate(owner.angle ?? 0);
    return [
      q[0] + owner.at[0] + pad.offset[0],
      q[1] + owner.at[1] + pad.offset[1],
    ];
  }
  distance(point: Point, owner: PadPlacement): number {
    const pad = this.data;
    const p = new PointShape([
      point[0] - owner.at[0] - pad.offset[0],
      point[1] - owner.at[1] - pad.offset[1],
    ]).rotate(-(owner.angle ?? 0));
    if (pad.custom && owner.back) p[1] *= -1;
    if (pad.custom?.length) {
      let distance = Infinity;
      if (pad.customPaths?.length) {
        for (const path of pad.customPaths)
          for (const edge of path)
            distance = Math.min(distance, new SegmentShape(edge).distance(p));
      } else distance = new PolygonShape(pad.custom).distance(p);
      return distance * (new PolygonShape(pad.custom).contains(p) ? -1 : 1);
    }
    if (pad.type === 2) return Math.hypot(...p) - pad.width / 2;
    if (pad.type === 25) {
      const radius = Math.hypot(...p);
      return Math.max(radius - pad.width / 2, pad.innerDiameter! / 2 - radius);
    }
    if (!this.supported()) return Infinity;
    const corner = this.corner(),
      x = Math.abs(p[0]) - pad.width / 2,
      y = Math.abs(p[1]) - pad.height / 2;
    if (this.chamfered())
      return Math.max(x, y, (x + y + corner) * Math.SQRT1_2);
    return (
      Math.hypot(Math.max(x + corner, 0), Math.max(y + corner, 0)) +
      Math.min(Math.max(x + corner, y + corner), 0) -
      corner
    );
  }
  /** Supply an owned scratch box to calculate without allocating a new box. */
  bounds(owner: PadPlacement, target?: Bounds): Bounds {
    const pad = this.data;
    if ((pad.type === 2 || pad.type === 25) && !pad.custom) {
      const x = owner.at[0] + pad.offset[0],
        y = owner.at[1] + pad.offset[1],
        r = pad.width / 2;
      if (!target)
        return { minX: x - r, minY: y - r, maxX: x + r, maxY: y + r };
      target.minX = x - r;
      target.minY = y - r;
      target.maxX = x + r;
      target.maxY = y + r;
      return target;
    }
    const bounds = target ?? {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    if (target) {
      bounds.minX = Infinity;
      bounds.minY = Infinity;
      bounds.maxX = -Infinity;
      bounds.maxY = -Infinity;
    }
    const points =
      pad.custom?.flat() ??
      ([
        [-pad.width / 2, -pad.height / 2],
        [pad.width / 2, -pad.height / 2],
        [pad.width / 2, pad.height / 2],
        [-pad.width / 2, pad.height / 2],
      ] as Point[]);
    for (const p of points) {
      const q = this.toWorld(p, owner);
      bounds.minX = Math.min(bounds.minX, q[0]);
      bounds.maxX = Math.max(bounds.maxX, q[0]);
      bounds.minY = Math.min(bounds.minY, q[1]);
      bounds.maxY = Math.max(bounds.maxY, q[1]);
    }
    return bounds;
  }
  mesh() {
    const pad = this.data;
    let mesh = PadShape.meshes.get(pad.custom!);
    if (!mesh) {
      mesh = new PolygonShape(pad.custom!).triangulate();
      PadShape.meshes.set(pad.custom!, mesh);
    }
    return mesh;
  }
  edges(owner: PadPlacement): Segment[] {
    return [...this.iterateEdges(owner)];
  }
  *iterateEdges(owner: PadPlacement): Generator<Segment> {
    const pad = this.data;
    function* localEdges() {
      if (pad.customPaths) {
        for (const path of pad.customPaths) yield* path;
      } else
        for (const ring of pad.custom!)
          for (let i = 0; i < ring.length; i++)
            yield {
              id: 0,
              trackId: 0,
              layer: pad.layer,
              net: 0,
              a: ring[i],
              b: ring[(i + 1) % ring.length],
              width: 0,
            } as Segment;
    }
    for (const edge of localEdges()) {
      const a = this.toWorld(edge.a, owner),
        b = this.toWorld(edge.b, owner);
      let arc: Segment["arc"];
      if (edge.arc) {
        const center = this.toWorld(edge.arc.center, owner);
        arc = {
          center,
          radius: edge.arc.radius,
          start: Math.atan2(a[1] - center[1], a[0] - center[0]),
          sweep: edge.arc.sweep * (owner.back ? -1 : 1),
        };
      }
      yield { ...edge, a, b, arc, layer: pad.layer, width: 0 };
    }
  }
}
