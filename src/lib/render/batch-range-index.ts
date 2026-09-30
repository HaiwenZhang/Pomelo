import type { Bounds } from "../board/model";
import type { PrimitiveBatch } from "./primitive-batch";
import { primitiveLayout } from "./primitive-layout";

/** A hierarchy over contiguous draw ranges. Never reorders translucent primitives.
 * Bounds use board-relative doubles (including residuals), like the GPU camera. */
export class BatchRangeIndex {
  private constructor(
    private readonly bounds: Float64Array,
    private readonly leaves: number,
    private readonly count: number,
    private readonly chunk: number,
  ) {}

  static *buildSteps(
    batch: PrimitiveBatch,
  ): Generator<void, BatchRangeIndex | undefined> {
    if (batch.indices || batch.category === "zone") return;
    const { stride, positions: lowStride } = primitiveLayout(batch);
    const unit = batch.triangles ? 3 : 1;
    const count = batch.data.length / stride;
    const chunk = 8 * unit;
    if (count <= chunk) return;
    const leaves = 2 ** Math.ceil(Math.log2(Math.ceil(count / chunk)));
    const bounds = new Float64Array(leaves * 2 * 4);
    for (let node = 1; node < leaves * 2; node++) {
      bounds.set([Infinity, Infinity, -Infinity, -Infinity], node * 4);
    }
    const data = batch.data,
      low = batch.residual;
    for (let i = 0; i < count; i++) {
      if ((i & 2047) === 0) yield;
      const at = i * stride,
        residual = i * lowStride;
      const value = (k: number) =>
        data[at + k] + (k < lowStride ? low[residual + k] : 0);
      let x0: number, y0: number, x1: number, y1: number;
      if (batch.msdf !== undefined) {
        const x = value(0),
          y = value(1),
          w = value(2),
          h = value(3);
        const cos = value(12),
          sin = value(13),
          sign = value(14);
        const dx = w * cos * sign,
          dy = w * sin;
        const ex = -h * sin * sign,
          ey = h * cos;
        x0 = Math.min(x, x + dx, x + ex, x + dx + ex);
        x1 = Math.max(x, x + dx, x + ex, x + dx + ex);
        y0 = Math.min(y, y + dy, y + ey, y + dy + ey);
        y1 = Math.max(y, y + dy, y + ey, y + dy + ey);
      } else if (batch.triangles) {
        x0 = x1 = value(0);
        y0 = y1 = value(1);
      } else if (batch.arcs) {
        x0 = value(8);
        y0 = value(9);
        x1 = value(10);
        y1 = value(11);
      } else {
        const x = value(0),
          y = value(1),
          z = value(2),
          w = value(3);
        const kind = data[at + 6],
          param = data[at + 4];
        if (kind < 0.5) {
          const radius = Math.abs(param) / 2;
          x0 = Math.min(x, z) - radius;
          x1 = Math.max(x, z) + radius;
          y0 = Math.min(y, w) - radius;
          y1 = Math.max(y, w) + radius;
        } else {
          let ex = Math.abs(z) + Math.abs(param) / 2,
            ey = ex;
          if (kind > 3.5 && kind < 6.5) {
            const c = Math.abs(Math.cos(param)),
              s = Math.abs(Math.sin(param));
            ex = c * Math.abs(z) + s * Math.abs(w);
            ey = s * Math.abs(z) + c * Math.abs(w);
          }
          x0 = x - ex;
          x1 = x + ex;
          y0 = y - ey;
          y1 = y + ey;
        }
      }
      const offset = (leaves + Math.floor(i / chunk)) * 4;
      bounds[offset] = Math.min(bounds[offset], x0);
      bounds[offset + 1] = Math.min(bounds[offset + 1], y0);
      bounds[offset + 2] = Math.max(bounds[offset + 2], x1);
      bounds[offset + 3] = Math.max(bounds[offset + 3], y1);
    }
    for (let node = leaves - 1; node > 0; node--) {
      const p = node * 4,
        a = node * 8,
        b = a + 4;
      bounds[p] = Math.min(bounds[a], bounds[b]);
      bounds[p + 1] = Math.min(bounds[a + 1], bounds[b + 1]);
      bounds[p + 2] = Math.max(bounds[a + 2], bounds[b + 2]);
      bounds[p + 3] = Math.max(bounds[a + 3], bounds[b + 3]);
    }
    return new BatchRangeIndex(bounds, leaves, count, chunk);
  }

  visible(
    view: Bounds,
    emit: (start: number, count: number) => void,
    first = 0,
    count = this.count,
  ) {
    let pendingStart = 0,
      pendingCount = 0;
    const end = first + count,
      b = this.bounds;
    const append = (start: number, stop: number) => {
      start = Math.max(first, start);
      stop = Math.min(end, stop, this.count);
      if (stop <= start) return;
      if (pendingCount && pendingStart + pendingCount !== start) {
        emit(pendingStart, pendingCount);
        pendingCount = 0;
      }
      if (!pendingCount) pendingStart = start;
      pendingCount += stop - start;
    };
    const visit = (node: number, start: number, stop: number) => {
      if (stop <= first || start >= end || start >= this.count) return;
      const p = node * 4;
      if (
        b[p] > view.maxX ||
        b[p + 2] < view.minX ||
        b[p + 1] > view.maxY ||
        b[p + 3] < view.minY
      )
        return;
      if (
        node >= this.leaves ||
        (b[p] >= view.minX &&
          b[p + 2] <= view.maxX &&
          b[p + 1] >= view.minY &&
          b[p + 3] <= view.maxY)
      ) {
        append(start, stop);
        return;
      }
      const middle = (start + stop) / 2;
      visit(node * 2, start, middle);
      visit(node * 2 + 1, middle, stop);
    };
    visit(1, 0, this.leaves * this.chunk);
    if (pendingCount) emit(pendingStart, pendingCount);
  }
}
