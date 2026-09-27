import type { Point } from "../../board/model";
import {
  areaD,
  booleanOpDWithPolyTree,
  ClipType,
  EndType,
  FillRule,
  inflatePathsD,
  JoinType,
  polyTreeToPathsD,
  PolyTreeD,
  type PathD,
  type PolyPathD,
} from "clipper2-ts";
import type { PadsCopperFill } from "./copper";
import { offsetPadsCopperContour } from "./copper-offset";
export interface PadsCopperRegion {
  outer: Point[];
  holes: Point[][];
}
/** Normalize a whole offset result, preserving its internal opposite-winding
 * holes. Normalizing every path separately would fill those holes. */
export function orientPadsOffsetRings(rings: Point[][]): PathD[] {
  const paths = rings.map((ring) => ring.map(([x, y]) => ({ x, y })));
  if (!paths.length) return paths;
  const largest = paths.reduce((a, b) =>
    Math.abs(areaD(a)) >= Math.abs(areaD(b)) ? a : b,
  );
  return areaD(largest) < 0 ? paths.map((path) => path.reverse()) : paths;
}
const points = (value: PathD): Point[] => value.map((p) => [p.x, p.y]);
/** Saved fill topology: exterior minus cutouts, then add finite-width thermal
 * strokes. Zero-width, zero-length junction markers carry no drawn geometry. */
export class PadsCopperRegionBuilder {
  constructor(private readonly fill: PadsCopperFill) {}
  build(signal?: AbortSignal): PadsCopperRegion[] {
    const { fill } = this;
    signal?.throwIfAborted();
    if (fill.unresolvedThermalPieces.length)
      throw new Error("PADS 热连接存在未解析几何");
    const outer = orientPadsOffsetRings(
        offsetPadsCopperContour(fill.outer, "outer"),
      ),
      holes: PathD[] = [];
    for (const hole of fill.holes) {
      signal?.throwIfAborted();
      holes.push(
        ...orientPadsOffsetRings(offsetPadsCopperContour(hole, "hole")),
      );
    }
    signal?.throwIfAborted();
    let tree = new PolyTreeD();
    booleanOpDWithPolyTree(
      ClipType.Difference,
      outer,
      holes,
      tree,
      FillRule.NonZero,
      6,
    );
    if (fill.thermals.length) {
      const byWidth = new Map<number, PathD[]>();
      for (const stroke of fill.thermals) {
        signal?.throwIfAborted();
        if (
          !(stroke.width > 0) ||
          !Number.isFinite(stroke.width) ||
          !stroke.a.every(Number.isFinite) ||
          !stroke.b.every(Number.isFinite)
        )
          throw new Error("PADS 热连接线段尺寸无效");
        const paths = byWidth.get(stroke.width) ?? [];
        paths.push([
          { x: stroke.a[0], y: stroke.a[1] },
          { x: stroke.b[0], y: stroke.b[1] },
        ]);
        byWidth.set(stroke.width, paths);
      }
      const thermal: PathD[] = [];
      for (const [width, paths] of byWidth) {
        signal?.throwIfAborted();
        for (const path of inflatePathsD(
          paths,
          width / 2,
          JoinType.Round,
          EndType.Round,
          2,
          6,
          0.000025,
        ))
          thermal.push(areaD(path) < 0 ? path.reverse() : path);
      }
      const merged = new PolyTreeD();
      booleanOpDWithPolyTree(
        ClipType.Union,
        polyTreeToPathsD(tree),
        thermal,
        merged,
        FillRule.NonZero,
        6,
      );
      tree = merged;
    }
    const regions: PadsCopperRegion[] = [];
    const visit = (node: PolyPathD) => {
      if (!node.isHole) {
        const poly = node.poly;
        if (!poly || poly.length < 3)
          throw new Error("PADS 铜区外轮廓布尔运算无效");
        const region: PadsCopperRegion = { outer: points(poly), holes: [] };
        for (let i = 0; i < node.count; i++) {
          const child = node.child(i),
            ring = child.poly;
          if (!child.isHole || !ring || ring.length < 3)
            throw new Error("PADS 铜区孔洞布尔运算无效");
          region.holes.push(points(ring));
        }
        regions.push(region);
      }
      for (let i = 0; i < node.count; i++) visit(node.child(i));
    };
    for (let i = 0; i < tree.count; i++) visit(tree.child(i));
    return regions;
  }
}
/** Compatibility entry point; parsing state belongs to PadsCopperRegionBuilder. */
export function buildPadsCopperRegions(
  fill: PadsCopperFill,
  signal?: AbortSignal,
): PadsCopperRegion[] {
  return new PadsCopperRegionBuilder(fill).build(signal);
}
