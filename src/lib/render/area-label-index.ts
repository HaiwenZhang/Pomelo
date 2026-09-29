import {
  buildEnvelopeTree,
  envelopeBufferSource,
  type EnvelopeNode,
} from "../spatial/envelope-tree";
import type { BoardScene, Bounds, Pin, Zone } from "../board/model";
import { ZoneShape } from "../board/shapes/zone";

import { completeSteps, completeStepsAsync } from "../iteration";
import { FontMetrics, LABEL_LAYOUT, type FontAtlas } from "./font-metrics";

/** Bounds and maximum possible glyph height, independent of display switches.
 * Candidates keep source order; all final layout and visibility rules stay in labels.ts. */
class EnvelopeIndex<T> {
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
    const ids: number[] = [],
      d = this.data;
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
    const visit = (n: EnvelopeNode) => {
      if (invisible(n.minX, n.minY, n.maxX, n.maxY, n.size)) return;
      if (n.left) {
        visit(n.left);
        visit(n.right!);
        return;
      }
      for (let i = n.start; i < n.end; i++) {
        this.lastExamined++;
        const id = this.order[i],
          j = id * 5;
        if (!invisible(d[j], d[j + 1], d[j + 2], d[j + 3], d[j + 4]))
          ids.push(id);
      }
    };
    visit(this.root);
    if (ids.length > this.values.length / 2) return this.values;
    ids.sort((a, b) => a - b);
    return ids.map((id) => this.values[id]);
  }
}

/** Remaining automatic-label categories: one entry per pin/zone, never per layer. */
export class AreaLabelIndex {
  private pins: EnvelopeIndex<Pin>;
  private zones: EnvelopeIndex<Zone>;
  constructor(scene: BoardScene, font: FontAtlas, deferred = false) {
    this.pins = new EnvelopeIndex(scene.pins, (pin) => {
      const name = scene.nets.get(pin.net);
      let size = 0;
      if (name) {
        const advance = FontMetrics.advance(font, name);
        for (const p of pin.shapes)
          size = Math.max(
            size,
            Math.min((p.width * 0.85) / advance, p.height * 0.65),
          );
      }
      // Preserve the existing layout's center test, including its 1 mm padding.
      const [x, y] = pin.at;
      return [{ minX: x - 1, minY: y - 1, maxX: x + 1, maxY: y + 1 }, size];
    });
    this.zones = new EnvelopeIndex(scene.zones, (zone) => {
      const bounds = new ZoneShape(zone).bounds(),
        name = scene.nets.get(zone.net);
      // Visible width cannot exceed the source width. Height and viewport limits
      // are applied by the final layout, so this is a conservative upper bound.
      const size = name
        ? ((bounds.maxX - bounds.minX) * LABEL_LAYOUT.zoneViewportWidthRatio) /
          Math.max(FontMetrics.advance(font, name), 1)
        : 0;
      return [bounds, size];
    });
    if (!deferred) completeSteps(this.build());
  }
  private *build() {
    yield* this.pins.build();
    yield* this.zones.build();
  }
  static async create(
    scene: BoardScene,
    font: FontAtlas,
    signal?: AbortSignal,
  ) {
    signal?.throwIfAborted();
    const index = new AreaLabelIndex(scene, font, true);
    await completeStepsAsync(index.build(), signal);
    return index;
  }
  queryPins(view: Bounds, scale: number) {
    return this.pins.query(view, scale, 8);
  }
  queryZones(view: Bounds, scale: number) {
    return this.zones.query(view, scale, LABEL_LAYOUT.zoneMinimumHeight);
  }
  get lastExamined() {
    return { pins: this.pins.lastExamined, zones: this.zones.lastExamined };
  }
}
