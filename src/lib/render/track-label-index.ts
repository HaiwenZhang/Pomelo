import {
  buildEnvelopeTree,
  envelopeBufferSource,
  type EnvelopeNode,
} from "../spatial/envelope-tree";
import type { Bounds } from "../board/model";
import type { Segment } from "../board/model";

import { completeSteps, completeStepsAsync } from "../iteration";
import { FontMetrics, LABEL_LAYOUT, type FontAtlas } from "./font-metrics";

/** Conservative envelopes of the existing repeated-label layout, not physical
 * copper bounds. Long names and short segments retain their original padding.
 * Built once for an immutable scene/font; display switches stay in layoutLabels. */
export class TrackLabelIndex {
  private order: Uint32Array;
  private envelopes: Float64Array;
  private root: EnvelopeNode | null = null;
  lastExamined = 0;
  constructor(
    private readonly segments: readonly Segment[],
    private readonly nets: ReadonlyMap<number, string>,
    private readonly font: FontAtlas,
    deferred = false,
  ) {
    this.order = new Uint32Array(segments.length);
    this.envelopes = new Float64Array(segments.length * 5);
    if (!deferred) completeSteps(this.build());
  }
  static async create(
    segments: readonly Segment[],
    nets: ReadonlyMap<number, string>,
    font: FontAtlas,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const index = new TrackLabelIndex(segments, nets, font, true);
    await completeStepsAsync(index.build(), signal);
    return index;
  }
  private *build(): Generator<void> {
    for (let i = 0; i < this.segments.length; i++) {
      const s = this.segments[i],
        name = this.nets.get(s.net);
      let padding = 0,
        width = 0;
      if (!s.arc && name) {
        const length = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]),
          advance = FontMetrics.advance(this.font, name);
        const size = Math.min(
          s.width * LABEL_LAYOUT.trackHeightRatio,
          (length * 0.85) / Math.max(advance, 1),
        );
        if (length > 0 && size > 0) {
          padding = advance * size + size;
          width = s.width;
        }
      }
      const j = i * 5;
      this.order[i] = i;
      this.envelopes[j] = Math.min(s.a[0], s.b[0]) - padding;
      this.envelopes[j + 1] = Math.min(s.a[1], s.b[1]) - padding;
      this.envelopes[j + 2] = Math.max(s.a[0], s.b[0]) + padding;
      this.envelopes[j + 3] = Math.max(s.a[1], s.b[1]) + padding;
      this.envelopes[j + 4] = width;
      if ((i & 4095) === 0) yield;
    }
    this.root = yield* buildEnvelopeTree(
      this.order,
      envelopeBufferSource(this.envelopes),
    );
  }
  query(view: Bounds, scale: number): readonly Segment[] {
    this.lastExamined = 0;
    if (!this.root || scale <= 0 || !Number.isFinite(scale)) return [];
    const ids: number[] = [],
      data = this.envelopes;
    const visit = (node: EnvelopeNode) => {
      if (
        node.size * scale < LABEL_LAYOUT.trackMinimumWidth ||
        node.maxX < view.minX ||
        node.minX > view.maxX ||
        node.maxY < view.minY ||
        node.minY > view.maxY
      )
        return;
      if (node.left) {
        visit(node.left);
        visit(node.right!);
        return;
      }
      for (let i = node.start; i < node.end; i++) {
        this.lastExamined++;
        const id = this.order[i],
          j = id * 5;
        if (
          data[j + 4] * scale >= LABEL_LAYOUT.trackMinimumWidth &&
          data[j + 2] >= view.minX &&
          data[j] <= view.maxX &&
          data[j + 3] >= view.minY &&
          data[j + 1] <= view.maxY
        )
          ids.push(id);
      }
    };
    visit(this.root);
    if (ids.length > this.segments.length / 2) return this.segments;
    ids.sort((a, b) => a - b);
    return ids.map((i) => this.segments[i]);
  }
}
