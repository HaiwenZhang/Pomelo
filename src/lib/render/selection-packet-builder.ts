import { buildArcBatches } from "./arc-batch-builder";
import { splitPositions } from "./position-precision";
import type { PrimitiveBatch } from "./primitive-batch";

/** Bound typed-array conversion work as well as GPU upload work. Keep all
 * straight instances before arcs, matching the original layer submission. */
export function* buildSelectionPackets(
  meta: Omit<PrimitiveBatch, "data" | "residual">,
  values: number[],
  stride = 12,
  curves = false,
): Generator<PrimitiveBatch | undefined> {
  const arcs: PrimitiveBatch[] = [],
    records = curves ? 4096 : 16384;
  for (let offset = 0; offset < values.length; offset += records * stride) {
    yield;
    const part = values.slice(offset, offset + records * stride);
    if (curves) {
      for (const packet of buildArcBatches(meta, part)) {
        if (packet.arcs) arcs.push(packet);
        else yield packet;
      }
    } else
      yield {
        ...meta,
        ...splitPositions(part, stride, stride === 6 ? 2 : 4),
      };
  }
  yield* arcs;
}
