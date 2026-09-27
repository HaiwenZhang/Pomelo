import type { PadShape, Point, Segment } from "../board/model";
import { PathShape } from "../board/shapes/path";
import { PolygonShape } from "../board/shapes/polygon";
import type { OdbArchive } from "./archive";
import {
  odbSegment,
  type OdbContour,
  type OdbSymbol,
  OdbFeatureReader,
} from "./features";
import { PadShape as BoardPadShape } from "../board/shapes/pad";
import { ShapeTransform } from "../board/shapes/transform";
export interface SymbolGeometry {
  pads: PadShape[];
  strokes: Segment[];
}
export function contourIslands(contours: OdbContour[]) {
  const islands = contours
    .filter((c) => c.kind === "I")
    .map((c) => ({
      paths: [c.path],
      rings: [new PathShape(c.path).flatten()],
    }));
  for (const hole of contours.filter((c) => c.kind === "H")) {
    const ring = new PathShape(hole.path).flatten();
    const candidates = islands.filter(
      (i) => ring.length && PolygonShape.containsRing(ring[0], i.rings[0]),
    );
    if (!candidates.length) throw new Error("ODB++ 孔洞没有所属岛");
    // Nested islands are independent positive surfaces. Attach to the smallest containing island.
    const area = (points: Point[]) =>
      Math.abs(
        points.reduce((s, p, j) => {
          const q = points[(j + 1) % points.length];
          return s + p[0] * q[1] - q[0] * p[1];
        }, 0),
      );
    candidates.sort((a, b) => area(a.rings[0]) - area(b.rings[0]));
    candidates[0].paths.push(hole.path);
    candidates[0].rings.push(ring);
  }
  return islands.filter((i) => i.rings[0].length >= 3);
}
function custom(
  paths: Segment[][],
  rings = paths.map((p) => new PathShape(p).flatten()),
): PadShape {
  const boxes = paths.map((path) => new PathShape(path).bounds()),
    width =
      Math.max(...boxes.map((b) => b.maxX)) -
      Math.min(...boxes.map((b) => b.minX)),
    height =
      Math.max(...boxes.map((b) => b.maxY)) -
      Math.min(...boxes.map((b) => b.minY));
  return {
    layer: 0,
    type: 22,
    width,
    height,
    offset: [0, 0],
    custom: rings,
    customPaths: paths,
  };
}
/** Analytic shapes are exactly the existing renderer's shapes; disjoint islands
 * become separate shapes so earcut is never asked to treat an island as a hole. */
export function standardSymbol(symbol: OdbSymbol): SymbolGeometry | undefined {
  const { name, scale } = symbol,
    n = "(\\d+(?:\\.\\d*)?)";
  let m: RegExpMatchArray | null;
  const pad = (
    type: number,
    w: number,
    h = w,
    extra: Partial<PadShape> = {},
  ): SymbolGeometry => ({
    pads: [
      {
        layer: 0,
        type,
        width: w * scale,
        height: h * scale,
        offset: [0, 0],
        ...extra,
      },
    ],
    strokes: [],
  });
  if ((m = name.match(new RegExp(`^r${n}$`)))) return pad(2, +m[1]);
  if ((m = name.match(new RegExp(`^s${n}$`)))) return pad(6, +m[1]);
  if ((m = name.match(new RegExp(`^donut_r${n}x${n}$`)))) {
    if (+m[2] > +m[1] || +m[1] <= 0) throw new Error(`ODB++ 无效圆环 ${name}`);
    // KiCad exports unfilled circles as diameter +/- stroke width. A zero
    // stroke therefore produces equal diameters: retain the analytic hairline.
    if (+m[2] === +m[1]) {
      const r = (+m[1] * scale) / 2;
      return { pads: [], strokes: [odbSegment([r, 0], [r, 0], 0, [0, 0])] };
    }
    if (+m[2] === 0) return pad(2, +m[1]);
    return pad(25, +m[1], +m[1], { innerDiameter: +m[2] * scale });
  }
  if ((m = name.match(new RegExp(`^oval${n}x${n}$`))))
    return pad(11, +m[1], +m[2]);
  if (
    (m = name.match(
      new RegExp(`^rect${n}x${n}(?:x([rc])${n}(?:x([1-4]+))?)?$`),
    ))
  ) {
    const w = +m[1] * scale,
      h = +m[2] * scale,
      r = m[4] ? +m[4] * scale : 0;
    if (!m[5])
      return pad(!r ? 6 : m[3] === "r" ? 27 : 28, +m[1], +m[2], { corner: r });
    const corners: Point[] = [
      [w / 2, h / 2],
      [-w / 2, h / 2],
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
    ];
    const starts: Point[] = [],
      ends: Point[] = [],
      centers: Point[] = [];
    for (let i = 0; i < 4; i++) {
      const radius = m[5].includes(String(i + 1)) ? r : 0,
        v = corners[i],
        prev = corners[(i + 3) % 4],
        next = corners[(i + 1) % 4];
      const a: Point = [
          v[0] + Math.sign(prev[0] - v[0]) * radius,
          v[1] + Math.sign(prev[1] - v[1]) * radius,
        ],
        b: Point = [
          v[0] + Math.sign(next[0] - v[0]) * radius,
          v[1] + Math.sign(next[1] - v[1]) * radius,
        ];
      starts.push(a);
      ends.push(b);
      centers.push([a[0] + b[0] - v[0], a[1] + b[1] - v[1]]);
    }
    const path: Segment[] = [];
    for (let i = 0; i < 4; i++) {
      const a = starts[i],
        b = ends[i];
      if (a[0] !== b[0] || a[1] !== b[1])
        path.push(odbSegment(a, b, 0, m[3] === "r" ? centers[i] : undefined));
      path.push(odbSegment(b, starts[(i + 1) % 4]));
    }
    return { pads: [custom([path])], strokes: [] };
  }
  if ((m = name.match(new RegExp(`^di${n}x${n}$`)))) {
    const w = (+m[1] * scale) / 2,
      h = (+m[2] * scale) / 2,
      p: Point[] = [
        [w, 0],
        [0, h],
        [-w, 0],
        [0, -h],
      ];
    return {
      pads: [custom([p.map((a, i) => odbSegment(a, p[(i + 1) % 4]))])],
      strokes: [],
    };
  }
  if ((m = name.match(new RegExp(`^ths${n}x${n}x${n}x(\\d+)x${n}$`)))) {
    const outer = (+m[1] * scale) / 2,
      inner = (+m[2] * scale) / 2,
      angle = (+m[3] * Math.PI) / 180,
      spokes = +m[4],
      gap = (+m[5] * scale) / 2;
    if (
      inner <= 0 ||
      outer <= inner ||
      spokes < 2 ||
      spokes > 64 ||
      gap <= 0 ||
      gap >= inner
    )
      throw new Error(`ODB++ 无效热焊盘 ${name}`);
    const pitch = (2 * Math.PI) / spokes,
      ao = Math.asin(gap / outer),
      ai = Math.asin(gap / inner),
      point = (r: number, a: number): Point => [
        r * Math.cos(a),
        r * Math.sin(a),
      ];
    if (ai * 2 >= pitch) throw new Error(`ODB++ 热焊盘间隙相交 ${name}`);
    const pads: PadShape[] = [];
    for (let i = 0; i < spokes; i++) {
      const a = angle + i * pitch,
        b = a + pitch,
        p0 = point(outer, a + ao),
        p1 = point(outer, b - ao),
        p2 = point(inner, b - ai),
        p3 = point(inner, a + ai);
      pads.push(
        custom([
          [
            odbSegment(p0, p1, 0, [0, 0]),
            odbSegment(p1, p2),
            odbSegment(p2, p3, 0, [0, 0], true),
            odbSegment(p3, p0),
          ],
        ]),
      );
    }
    return { pads, strokes: [] };
  }
  return undefined;
}
export class OdbSymbolReader {
  private readonly cache = new Map<string, SymbolGeometry>();
  private readonly pending = new Set<string>();
  private readonly resolved = new WeakMap<OdbSymbol, SymbolGeometry>();
  constructor(
    private readonly archive: OdbArchive,
    private readonly units: string,
    private readonly signal?: AbortSignal,
  ) {}
  read(symbol: OdbSymbol): SymbolGeometry | Promise<SymbolGeometry> {
    const local = this.resolved.get(symbol);
    if (local) return local;
    const key = `${symbol.name}:${symbol.scale}`;
    const cached = this.cache.get(key);
    if (cached) {
      this.resolved.set(symbol, cached);
      return cached;
    }
    const standard = standardSymbol(symbol);
    if (standard) {
      this.cache.set(key, standard);
      this.resolved.set(symbol, standard);
      return standard;
    }
    if (this.pending.has(key))
      throw new Error(`ODB++ 循环符号引用：${symbol.name}`);
    return this.readCustom(symbol, key);
  }
  private async readCustom(
    symbol: OdbSymbol,
    key: string,
  ): Promise<SymbolGeometry> {
    this.pending.add(key);
    try {
      const result: SymbolGeometry = { pads: [], strokes: [] };
      for await (const feature of new OdbFeatureReader(
        this.archive.text(`symbols/${symbol.name}/features`),
        this.units,
      ).read(this.signal)) {
        if (feature.kind === "surface")
          for (const island of contourIslands(feature.contours))
            result.pads.push(custom(island.paths, island.rings));
        else if (feature.kind === "line") {
          const brush = await this.read(feature.symbol);
          if (
            brush.pads.length !== 1 ||
            brush.pads[0].type !== 2 ||
            brush.strokes.length
          )
            throw new Error(`ODB++ 非圆线刷：${feature.symbol.name}`);
          feature.segment.width = brush.pads[0].width;
          result.strokes.push(feature.segment);
        } else {
          const nested = await this.read(feature.symbol);
          for (const pad of nested.pads) {
            if (pad.width <= 0 || pad.height <= 0) continue;
            const paths = new BoardPadShape(pad)
              .paths()
              .map((path) =>
                path.map((s) =>
                  new ShapeTransform(
                    feature.at,
                    feature.angle,
                    feature.mirror,
                  ).segment(s),
                ),
              );
            result.pads.push(custom(paths));
          }
          for (const stroke of nested.strokes)
            result.strokes.push(
              new ShapeTransform(
                feature.at,
                feature.angle,
                feature.mirror,
              ).segment(stroke),
            );
        }
      }
      this.cache.set(key, result);
      this.resolved.set(symbol, result);
      return result;
    } finally {
      this.pending.delete(key);
    }
  }
}
/** Compatibility factory; the returned reader owns an import-local symbol cache. */
export function symbolReader(
  archive: OdbArchive,
  units: string,
  signal?: AbortSignal,
) {
  const reader = new OdbSymbolReader(archive, units, signal);
  return reader.read.bind(reader);
}
