import {
  buildEnvelopeTree,
  queryEnvelopeTree,
  type EnvelopeNode,
} from "../spatial/envelope-tree";
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
    const visible = (
      minX: number,
      minY: number,
      maxX: number,
      maxY: number,
      pad: number,
    ) =>
      pad * scale >= minimumPixels &&
      maxX + pad >= view.minX &&
      minX - pad <= view.maxX &&
      maxY + pad >= view.minY &&
      minY - pad <= view.maxY;
    const result = queryEnvelopeTree(
      this.root,
      this.order,
      this.vias,
      (node) => !visible(node.minX, node.minY, node.maxX, node.maxY, node.size),
      (id) => {
        const [x, y] = this.vias[id].at;
        return visible(x, y, x, y, this.diameters[id]);
      },
    );
    this.lastExamined = result.examined;
    return result.values;
  }
}
