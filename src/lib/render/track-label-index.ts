import type { Bounds } from "../board/model";
import type { Segment } from "../board/model";

import { cooperative } from "../cooperative";
import { FontMetrics, LABEL_LAYOUT, type FontAtlas } from "./font-metrics";

interface Node extends Bounds {
  width: number;
  start: number;
  end: number;
  left?: Node;
  right?: Node;
}

/** Conservative envelopes of the existing repeated-label layout, not physical
 * copper bounds. Long names and short segments retain their original padding.
 * Built once for an immutable scene/font; display switches stay in layoutLabels. */
export class TrackLabelIndex {
  private order: Uint32Array;
  private envelopes: Float64Array;
  private root: Node | null = null;
  lastExamined = 0;
  constructor(
    private readonly segments: readonly Segment[],
    private readonly nets: ReadonlyMap<number, string>,
    private readonly font: FontAtlas,
    deferred = false,
  ) {
    this.order = new Uint32Array(segments.length);
    this.envelopes = new Float64Array(segments.length * 5);
    if (!deferred) for (const _ of this.build()) void _;
  }
  static async create(
    segments: readonly Segment[],
    nets: ReadonlyMap<number, string>,
    font: FontAtlas,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const index = new TrackLabelIndex(segments, nets, font, true),
      checkpoint = cooperative(signal);
    for (const _ of index.build()) {
      void _;
      const pause = checkpoint();
      if (pause) await pause;
    }
    signal?.throwIfAborted();
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
    if (this.segments.length)
      this.root = yield* this.node(0, this.segments.length);
  }
  private *node(start: number, end: number): Generator<void, Node> {
    const node: Node = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
        width: 0,
        start,
        end,
      },
      data = this.envelopes;
    for (let i = start; i < end; i++) {
      const j = this.order[i] * 5;
      node.minX = Math.min(node.minX, data[j]);
      node.minY = Math.min(node.minY, data[j + 1]);
      node.maxX = Math.max(node.maxX, data[j + 2]);
      node.maxY = Math.max(node.maxY, data[j + 3]);
      node.width = Math.max(node.width, data[j + 4]);
      if ((i & 4095) === 0) yield;
    }
    if (end - start <= 128) return node;
    const axis = node.maxX - node.minX >= node.maxY - node.minY ? 0 : 1,
      mid = (start + end) >>> 1;
    const center = (i: number) => {
      const j = this.order[i] * 5 + axis;
      return data[j] + data[j + 2];
    };
    let low = start,
      high = end - 1,
      work = 0;
    while (low < high) {
      const pivot = center((low + high) >>> 1);
      let a = low,
        b = high;
      while (a <= b) {
        while (center(a) < pivot) {
          a++;
          if ((++work & 4095) === 0) yield;
        }
        while (center(b) > pivot) {
          b--;
          if ((++work & 4095) === 0) yield;
        }
        if (a <= b) {
          const swap = this.order[a];
          this.order[a++] = this.order[b];
          this.order[b--] = swap;
        }
        if ((++work & 4095) === 0) yield;
      }
      if (mid <= b) high = b;
      else if (mid >= a) low = a;
      else break;
    }
    node.left = yield* this.node(start, mid);
    node.right = yield* this.node(mid, end);
    return node;
  }
  query(view: Bounds, scale: number): readonly Segment[] {
    this.lastExamined = 0;
    if (!this.root || scale <= 0 || !Number.isFinite(scale)) return [];
    const ids: number[] = [],
      data = this.envelopes;
    const visit = (node: Node) => {
      if (
        node.width * scale < LABEL_LAYOUT.trackMinimumWidth ||
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
