import type { Bounds } from "../board/model";
import {
  buildEnvelopeTree,
  envelopeBufferSource,
  queryEnvelopeTree,
  type EnvelopeNode,
} from "./envelope-tree";

/** Bounds and maximum source size, independent of display switches.
 * Candidates retain source order; exact layout and visibility stay with the caller. */
export class EnvelopeIndex<T> {
  private order: Uint32Array;
  private data: Float64Array;
  private root: EnvelopeNode | null = null;
  lastExamined = 0;
  constructor(
    private values: readonly T[],
    private envelope: (value: T) => [Bounds, number],
  ) {
    this.order = new Uint32Array(values.length);
    this.data = new Float64Array(values.length * 5);
  }
  *build(): Generator<void> {
    for (let i = 0; i < this.values.length; i++) {
      const [b, size] = this.envelope(this.values[i]),
        j = i * 5;
      this.order[i] = i;
      this.data[j] = b.minX;
      this.data[j + 1] = b.minY;
      this.data[j + 2] = b.maxX;
      this.data[j + 3] = b.maxY;
      this.data[j + 4] = size;
      if ((i & 1023) === 0) yield;
    }
    this.root = yield* buildEnvelopeTree(
      this.order,
      envelopeBufferSource(this.data),
    );
  }
  query(view: Bounds, scale: number, minimum: number): readonly T[] {
    this.lastExamined = 0;
    if (!this.root || scale <= 0 || !Number.isFinite(scale)) return [];
    const d = this.data;
    // A small margin avoids rejecting a threshold survivor due to reassociation
    // of the viewport-relative arithmetic used in the final layout.
    const invisible = (
      minX: number,
      minY: number,
      maxX: number,
      maxY: number,
      size: number,
    ) =>
      size * scale < minimum - 1e-7 ||
      maxX < view.minX ||
      minX > view.maxX ||
      maxY < view.minY ||
      minY > view.maxY;
    const result = queryEnvelopeTree(
      this.root,
      this.order,
      this.values,
      (n) => invisible(n.minX, n.minY, n.maxX, n.maxY, n.size),
      (id) => {
        const j = id * 5;
        return !invisible(d[j], d[j + 1], d[j + 2], d[j + 3], d[j + 4]);
      },
    );
    this.lastExamined = result.examined;
    return result.values;
  }
}
