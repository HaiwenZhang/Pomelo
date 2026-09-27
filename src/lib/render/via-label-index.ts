import type { Bounds } from "../board/model";
import type { Via } from "../board/model";

import { cooperative } from "../cooperative";

/** Keep the label envelope independent of pad/drill picking bounds: simultaneous
 * span and net rows can extend beyond a physical hole. Scene objects are immutable. */
interface Node extends Bounds {
  diameter: number;
  start: number;
  end: number;
  left?: Node;
  right?: Node;
}

/** One entry per via, not per pad layer. Construction yields on the main thread;
 * queries preserve original source order so coincident labels blend identically. */
export class ViaLabelIndex {
  static labelDiameter(via: Via) {
    if (via.backdrill) return via.backdrill.labelDiameter;
    let diameter = via.drill;
    for (const pad of via.pads) diameter = Math.max(diameter, pad.width);
    return diameter;
  }
  private order: Uint32Array;
  private diameters: Float64Array;
  private root: Node | null = null;
  lastExamined = 0;
  constructor(
    private readonly vias: readonly Via[],
    deferred = false,
  ) {
    this.order = new Uint32Array(vias.length);
    this.diameters = new Float64Array(vias.length);
    if (!deferred) for (const _ of this.build()) void _;
  }
  static async create(vias: readonly Via[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    const index = new ViaLabelIndex(vias, true),
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
    for (let i = 0; i < this.vias.length; i++) {
      this.order[i] = i;
      this.diameters[i] = ViaLabelIndex.labelDiameter(this.vias[i]);
      if ((i & 4095) === 0) yield;
    }
    if (this.vias.length) this.root = yield* this.node(0, this.vias.length);
  }
  private *node(start: number, end: number): Generator<void, Node> {
    const node: Node = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
      diameter: 0,
      start,
      end,
    };
    for (let i = start; i < end; i++) {
      const id = this.order[i],
        [x, y] = this.vias[id].at;
      node.minX = Math.min(node.minX, x);
      node.maxX = Math.max(node.maxX, x);
      node.minY = Math.min(node.minY, y);
      node.maxY = Math.max(node.maxY, y);
      node.diameter = Math.max(node.diameter, this.diameters[id]);
      if ((i & 4095) === 0) yield;
    }
    if (end - start <= 128) return node;
    const axis = node.maxX - node.minX >= node.maxY - node.minY ? 0 : 1,
      mid = (start + end) >>> 1;
    let low = start,
      high = end - 1,
      work = 0;
    while (low < high) {
      const pivot = this.vias[this.order[(low + high) >>> 1]].at[axis];
      let a = low,
        b = high;
      while (a <= b) {
        while (this.vias[this.order[a]].at[axis] < pivot) {
          a++;
          if ((++work & 4095) === 0) yield;
        }
        while (this.vias[this.order[b]].at[axis] > pivot) {
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
  query(view: Bounds, scale: number, minimumPixels: number): readonly Via[] {
    this.lastExamined = 0;
    if (!this.root || scale <= 0 || !Number.isFinite(scale)) return [];
    const ids: number[] = [];
    const visit = (node: Node) => {
      const pad = node.diameter;
      if (
        pad * scale < minimumPixels ||
        node.maxX + pad < view.minX ||
        node.minX - pad > view.maxX ||
        node.maxY + pad < view.minY ||
        node.minY - pad > view.maxY
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
          pad = this.diameters[id];
        if (pad * scale < minimumPixels) continue;
        const [x, y] = this.vias[id].at;
        if (
          x + pad >= view.minX &&
          x - pad <= view.maxX &&
          y + pad >= view.minY &&
          y - pad <= view.maxY
        )
          ids.push(id);
      }
    };
    visit(this.root);
    // Dense whole-board views already need the source scan; avoid sorting a
    // million candidates when only the spatially local case benefits from it.
    if (ids.length > this.vias.length / 2) return this.vias;
    ids.sort((a, b) => a - b);
    return ids.map((i) => this.vias[i]);
  }
}
