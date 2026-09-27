import type { PadShape as PadData, Point, Segment } from "../board/model";
import { PadShape } from "../board/shapes/pad";
import { ShapeTransform } from "../board/shapes/transform";
/** Compatibility adapters for existing ODB consumers. Shared geometry lives in board/shapes. */
export function transformPoint(
  point: Point,
  at: Point,
  angle: number,
  mirror: boolean,
): Point {
  return new ShapeTransform(at, angle, mirror).point(point);
}
export function transformSegment(
  segment: Segment,
  at: Point,
  angle: number,
  mirror: boolean,
): Segment {
  return new ShapeTransform(at, angle, mirror).segment(segment);
}
export function padPaths(pad: PadData): Segment[][] {
  return new PadShape(pad).paths();
}
