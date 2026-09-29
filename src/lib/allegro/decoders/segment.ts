import type { Point, Segment } from "../../board/model";
import { ArcShape } from "../../board/shapes/arc";
import type { AllegroRecord } from "../binary/record-types";

const roundGrid = (value: number): number => {
  const lower = Math.floor(value);
  return value - lower === 0.5
    ? lower % 2 === 0
      ? lower
      : lower + 1
    : Math.round(value);
};

/** Decode a single verified source edge. Ownership, membership and chain
 * validation belong to each caller; hatch geometry retains its native rounding. */
export function decodeAllegroSegment(
  record: AllegroRecord<0x01 | 0x15 | 0x16 | 0x17>,
  scale: number,
  hatch = false,
): Segment {
  const a: Point = [record.StartX * scale, record.StartY * scale];
  const b: Point = [record.EndX * scale, record.EndY * scale];
  const segment: Segment = {
    id: record.Key,
    trackId: 0,
    layer: -1,
    net: 0,
    a,
    b,
    width: record.Width * scale,
  };
  if (record.type === 1) {
    const center: Point = [
      (hatch ? roundGrid(record.CenterX) : record.CenterX) * scale,
      (hatch ? roundGrid(record.CenterY) : record.CenterY) * scale,
    ];
    const radius = hatch
      ? (Math.hypot(a[0] - center[0], a[1] - center[1]) +
          Math.hypot(b[0] - center[0], b[1] - center[1])) /
        2
      : Math.hypot(a[0] - center[0], a[1] - center[1]);
    const start = Math.atan2(a[1] - center[1], a[0] - center[0]);
    segment.arc = {
      center,
      radius,
      start,
      sweep: ArcShape.sweep(
        start,
        Math.atan2(b[1] - center[1], b[0] - center[0]),
        (record.SubType & 64) !== 0,
      ),
    };
  }
  return segment;
}
