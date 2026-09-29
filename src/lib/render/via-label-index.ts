import { buildEnvelopeTree, type EnvelopeNode } from "../spatial/envelope-tree";
import type { Bounds } from "../board/model";
import type { Via } from "../board/model";

import { completeSteps, completeStepsAsync } from "../iteration";

/** Keep the label envelope independent of pad/drill picking bounds: simultaneous
 * span and net rows can extend beyond a physical hole. Scene objects are immutable. */

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
  private root: EnvelopeNode | null = null;
  lastExamined = 0;
  constructor(
    private readonly vias: readonly Via[],
    deferred = false,
  ) {
    this.order = new Uint32Array(vias.length);
    this.diameters = new Float64Array(vias.length);
    if (!deferred) completeSteps(this.build());
  }
  static async create(vias: readonly Via[], signal?: AbortSignal) {
    signal?.throwIfAborted();
    const index = new ViaLabelIndex(vias, true);
    await completeStepsAsync(index.build(), signal);
    return index;
  }
  private *build(): Generator<void> {
    for (let i = 0; i < this.vias.length; i++) {
      this.order[i] = i;
      this.diameters[i] = ViaLabelIndex.labelDiameter(this.vias[i]);
      if ((i & 4095) === 0) yield;
    }
    this.root = yield* buildEnvelopeTree(this.order, {
      include: (node, id) => {
        const [x, y] = this.vias[id].at;
        node.minX = Math.min(node.minX, x);
        node.minY = Math.min(node.minY, y);
        node.maxX = Math.max(node.maxX, x);
        node.maxY = Math.max(node.maxY, y);
        node.size = Math.max(node.size, this.diameters[id]);
      },
      center: (id, axis) => this.vias[id].at[axis],
    });
  }
  query(view: Bounds, scale: number, minimumPixels: number): readonly Via[] {
    this.lastExamined = 0;
    if (!this.root || scale <= 0 || !Number.isFinite(scale)) return [];
    const ids: number[] = [];
    const visit = (node: EnvelopeNode) => {
      const pad = node.size;
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
