import type { Bounds } from "../board/model";
import type { PrimitiveBatch } from "./primitive-batch";

/** Pack adjacent hole-free copper without changing per-zone drawing order.
 * Labelled zones retain individual ranges and masks within the shared buffers. */
export function* packCopperBatches(
  steps: Iterable<PrimitiveBatch | undefined>,
): Generator<PrimitiveBatch | undefined> {
  let group: PrimitiveBatch[] = [],
    bytes = 0;
  function flush() {
    if (group.length === 1) {
      const only = group[0];
      group = [];
      bytes = 0;
      return only;
    }
    const first = group[0],
      vertices = group.reduce((sum, b) => sum + b.data.length, 0),
      indexCount = group.reduce((sum, b) => sum + b.indices!.length, 0);
    const data = new Float32Array(vertices),
      residual = new Float32Array(vertices),
      indices = new Uint32Array(indexCount);
    const zones: NonNullable<PrimitiveBatch["zones"]> = [],
      bounds: Bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
    let vertexOffset = 0,
      indexOffset = 0;
    for (const batch of group) {
      data.set(batch.data, vertexOffset);
      residual.set(batch.residual, vertexOffset);
      for (let i = 0; i < batch.indices!.length; i++)
        indices[indexOffset + i] = batch.indices![i] + vertexOffset / 2;
      const zone = batch.zones![0];
      zones.push({ ...zone, start: indexOffset, bounds: batch.bounds });
      const b = batch.bounds!;
      bounds.minX = Math.min(bounds.minX, b.minX);
      bounds.maxX = Math.max(bounds.maxX, b.maxX);
      bounds.minY = Math.min(bounds.minY, b.minY);
      bounds.maxY = Math.max(bounds.maxY, b.maxY);
      vertexOffset += batch.data.length;
      indexOffset += batch.indices!.length;
    }
    group = [];
    bytes = 0;
    return {
      ...first,
      data,
      residual,
      indices,
      zones,
      bounds,
      holeChunks: undefined,
    };
  }
  for (const batch of steps) {
    if (!batch) {
      yield;
      continue;
    }
    const eligible =
      batch.category === "zone" &&
      batch.bounds &&
      batch.color &&
      batch.indices &&
      batch.zones?.length === 1 &&
      batch.zones[0].outerCount === batch.indices.length;
    const size =
      batch.data.byteLength +
      batch.residual.byteLength +
      (batch.indices?.byteLength ?? 0);
    if (
      group.length &&
      (!eligible ||
        group[0].layer !== batch.layer ||
        group.length >= 256 ||
        bytes + size > 4 * 1024 * 1024 ||
        !batch.color?.every((c, i) => c === group[0].color![i]))
    )
      yield flush();
    if (eligible) {
      group.push(batch);
      bytes += size;
    } else yield batch;
  }
  if (group.length) yield flush();
}
