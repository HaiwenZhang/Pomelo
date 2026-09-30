import type { Point, Segment } from "../board/model";

/** Float lanes and compensated position lanes for the shared GPU packet formats. */
export const STROKE_PACKET = { stride: 12, positions: 4 } as const;
export const ARC_PACKET = { stride: 20, positions: 12 } as const;
export const TRIANGLE_PACKET = { stride: 6, positions: 2 } as const;
export function primitiveLayout(batch: {
  triangles?: boolean;
  arcs?: boolean;
}) {
  return batch.triangles
    ? TRIANGLE_PACKET
    : batch.arcs
      ? ARC_PACKET
      : STROKE_PACKET;
}

/** Encode source strokes directly, retaining doubles until packet conversion. */
export function appendStroke(
  target: number[],
  stroke: { a: Point; b: Point; width: number; arc?: Segment["arc"] },
  originX: number,
  originY: number,
  color: readonly number[],
  width = stroke.width,
) {
  const arc = stroke.arc;
  if (arc)
    target.push(
      arc.center[0] - originX,
      arc.center[1] - originY,
      arc.radius,
      arc.start,
      width,
      arc.sweep,
      1,
      0,
      color[0],
      color[1],
      color[2],
      color[3] ?? 1,
    );
  else
    target.push(
      stroke.a[0] - originX,
      stroke.a[1] - originY,
      stroke.b[0] - originX,
      stroke.b[1] - originY,
      width,
      0,
      0,
      0,
      color[0],
      color[1],
      color[2],
      color[3] ?? 1,
    );
}
