import type { Point, Segment } from "../board/model";
import { ArcShape } from "../board/shapes/arc";
import { PadShape as BoardPadShape } from "../board/shapes/pad";
import { ShapeTransform } from "../board/shapes/transform";
import type { DefObject } from "./binary/def";
import { defInteger, defNumber, defObject } from "./metadata/layout";
import { parserError } from "../parser-error";
/** PolygonData stores alternating metre coordinates. A pair (height, DBL_MAX)
 * between vertices is a signed sagitta, confirmed with native EDB ArcData.
 * Positive height bends to the left of the directed chord and traverses CW. */
export function defPolygonPath(polygon: DefObject): Segment[] {
  if (polygon.schema !== 36 || !Array.isArray(polygon.fields[2]))
    throw parserError("hfssInvalidPolygonDataType");
  const values = polygon.fields[2],
    closed = polygon.fields[0] === 1;
  if (values.length % 2) throw parserError("hfssInvalidPolygonCoordinateCount");
  if (!values.length) return [];
  const numeric = (i: number) => {
    const n = values[i];
    if (typeof n !== "number" || !Number.isFinite(n))
      throw parserError("hfssInvalidPolygonCoordinate");
    return n;
  };
  const point = (i: number): Point => [
    numeric(i) * 1000,
    numeric(i + 1) * 1000,
  ];
  if (numeric(1) === Number.MAX_VALUE)
    throw parserError("hfssArcAtContourStart");
  const first = point(0),
    path: Segment[] = [];
  let previous = first,
    height = 0,
    pendingArc = false;
  const edge = (next: Point) => {
    const segment: Segment = {
      id: 0,
      trackId: 0,
      layer: 0,
      net: 0,
      a: previous,
      b: next,
      width: 0,
    };
    if (pendingArc && height !== 0) {
      const dx = next[0] - previous[0],
        dy = next[1] - previous[1],
        chord = Math.hypot(dx, dy);
      if (!chord) throw parserError("hfssCoincidentArcEndpoints");
      const offset = (chord * chord) / (8 * height) - height / 2;
      const center: Point = [
        (previous[0] + next[0]) / 2 + (dy / chord) * offset,
        (previous[1] + next[1]) / 2 - (dx / chord) * offset,
      ];
      const start = Math.atan2(
        previous[1] - center[1],
        previous[0] - center[0],
      );
      segment.arc = {
        center,
        radius: Math.hypot(previous[0] - center[0], previous[1] - center[1]),
        start,
        sweep: ArcShape.sweep(
          start,
          Math.atan2(next[1] - center[1], next[0] - center[0]),
          height > 0,
        ),
      };
    }
    if (segment.arc || previous[0] !== next[0] || previous[1] !== next[1])
      path.push(segment);
    previous = next;
    pendingArc = false;
    height = 0;
  };
  for (let i = 2; i < values.length; i += 2) {
    if (numeric(i + 1) === Number.MAX_VALUE) {
      if (pendingArc) throw parserError("hfssConsecutiveArcMarkers");
      height = numeric(i) * 1000;
      pendingArc = true;
    } else edge(point(i));
  }
  if (closed) edge(first);
  else if (pendingArc) throw parserError("hfssOpenArcWithoutEndpoint");
  return path;
}
export function defPrimitivePath(primitive: DefObject): Segment[] {
  if (primitive.schema === 15)
    return defPolygonPath(defObject(primitive.fields[1], 36));
  if (primitive.schema === 13) {
    const x = defNumber(primitive.fields[1]) * 1000,
      y = defNumber(primitive.fields[2]) * 1000,
      r = defNumber(primitive.fields[3]) * 1000;
    if (r <= 0) throw parserError("hfssInvalidCircleRadius");
    return new BoardPadShape({
      layer: 0,
      type: 2,
      width: r * 2,
      height: r * 2,
      offset: [0, 0],
    })
      .paths()[0]
      .map((s) => new ShapeTransform([x, y], 0, false).segment(s));
  }
  if (primitive.schema === 12) {
    const representation = defInteger(primitive.fields[1]);
    if (representation !== 2)
      throw parserError("hfssUnverifiedRectangleRepresentation", {
        detail: representation,
      });
    const x0 = defNumber(primitive.fields[2]) * 1000,
      y0 = defNumber(primitive.fields[3]) * 1000;
    const x1 = defNumber(primitive.fields[4]) * 1000,
      y1 = defNumber(primitive.fields[5]) * 1000;
    const corner = defNumber(primitive.fields[6]) * 1000,
      angle = defNumber(primitive.fields[7]);
    const width = x1 - x0,
      height = y1 - y0;
    if (
      width <= 0 ||
      height <= 0 ||
      corner < 0 ||
      corner > Math.min(width, height) / 2
    )
      throw parserError("hfssInvalidRectangleDimensions");
    return new BoardPadShape({
      layer: 0,
      type: corner > 0 ? 27 : 5,
      width,
      height,
      corner,
      offset: [0, 0],
    })
      .paths()[0]
      .map((s) =>
        new ShapeTransform(
          [(x0 + x1) / 2, (y0 + y1) / 2],
          angle,
          false,
        ).segment(s),
      );
  }
  throw parserError("hfssUnreadablePrimitiveOutline", {
    detail: primitive.schema,
  });
}
