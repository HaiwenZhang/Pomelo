import { buildArcBatchSteps } from "./arc-batch-builder";
import { splitPositionSteps } from "./position-precision";
import type { PrimitiveBatch } from "./primitive-batch";
import { STROKE_PACKET, TRIANGLE_PACKET } from "./primitive-layout";

/** Bound typed-array conversion work as well as GPU upload work. Keep all
 * straight instances before arcs, matching the original layer submission. */
export function* buildSelectionPackets(
  meta: Omit<PrimitiveBatch, "data" | "residual">,
  values: number[],
  stride: number = STROKE_PACKET.stride,
  curves = false,
): Generator<PrimitiveBatch | undefined> {
  const arcs: PrimitiveBatch[] = [],
    records = curves ? 4096 : 16384;
  for (let offset = 0; offset < values.length; offset += records * stride) {
    yield;
    const part = values.slice(offset, offset + records * stride);
    if (curves) {
      for (const packet of yield* buildArcBatchSteps(meta, part)) {
        if (packet.arcs) arcs.push(packet);
        else yield packet;
      }
    } else
      yield {
        ...meta,
        ...(yield* splitPositionSteps(
          part,
          stride,
          stride === TRIANGLE_PACKET.stride
            ? TRIANGLE_PACKET.positions
            : STROKE_PACKET.positions,
        )),
      };
  }
  yield* arcs;
}
