import { EnvelopeIndex } from "../spatial/envelope-index";
import type { BoardScene, Bounds, Pin, Zone } from "../board/model";
import { ZoneShape } from "../board/shapes/zone";

import { completeSteps, completeStepsAsync } from "../iteration";
import { FontMetrics, LABEL_LAYOUT, type FontAtlas } from "./font-metrics";

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
