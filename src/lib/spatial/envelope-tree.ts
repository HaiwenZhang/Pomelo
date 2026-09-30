import type { Bounds } from "../board/model";
import { partitionMedian } from "./median-partition";

export interface EnvelopeNode extends Bounds {
  size: number;
  start: number;
  end: number;
  left?: EnvelopeNode;
  right?: EnvelopeNode;
}

export interface EnvelopeSource {
  include(node: EnvelopeNode, id: number): void;
  center(id: number, axis: number): number;
}

/** Bounds and size stored as five doubles per source entry. */
export function envelopeBufferSource(data: Float64Array): EnvelopeSource {
  return {
    include(node, id) {
      const offset = id * 5;
      node.minX = Math.min(node.minX, data[offset]);
      node.minY = Math.min(node.minY, data[offset + 1]);
      node.maxX = Math.max(node.maxX, data[offset + 2]);
      node.maxY = Math.max(node.maxY, data[offset + 3]);
      node.size = Math.max(node.size, data[offset + 4]);
    },
    center(id, axis) {
      const offset = id * 5 + axis;
      return data[offset] + data[offset + 2];
    },
  };
}

/** Median partitioning and bounded checkpoints shared by label indices.
 * Sources choose their own envelopes without duplicating or copying geometry. */
export function* buildEnvelopeTree(
  order: Uint32Array,
  source: EnvelopeSource,
): Generator<void, EnvelopeNode | null> {
  function* node(start: number, end: number): Generator<void, EnvelopeNode> {
    const result: EnvelopeNode = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      size: 0,
      start,
      end,
    };
    for (let i = start; i < end; i++) {
      source.include(result, order[i]);
      if ((i & 4095) === 0) yield;
    }
    if (end - start <= 128) return result;
    const axis = result.maxX - result.minX >= result.maxY - result.minY ? 0 : 1;
    const mid = (start + end) >>> 1;
    yield* partitionMedian(order, (id) => source.center(id, axis), start, end);
    result.left = yield* node(start, mid);
    result.right = yield* node(mid, end);
    return result;
  }
  return order.length ? yield* node(0, order.length) : null;
}

/** Sparse queries restore source order; dense views avoid sorting most entries. */
export function queryEnvelopeTree<T>(
  root: EnvelopeNode | null,
  order: Uint32Array,
  values: readonly T[],
  reject: (node: EnvelopeNode) => boolean,
  accepts: (id: number) => boolean,
): { values: readonly T[]; examined: number } {
  const ids: number[] = [];
  let examined = 0;
  const visit = (node: EnvelopeNode) => {
    if (reject(node)) return;
    if (node.left) {
      visit(node.left);
      visit(node.right!);
    } else
      for (let i = node.start; i < node.end; i++) {
        examined++;
        const id = order[i];
        if (accepts(id)) ids.push(id);
      }
  };
  if (root) visit(root);
  if (ids.length > values.length / 2) return { values, examined };
  ids.sort((a, b) => a - b);
  return { values: ids.map((id) => values[id]), examined };
}
