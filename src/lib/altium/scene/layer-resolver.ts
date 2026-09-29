import type { DrawingLayer } from "../../board/model";
import {
  altiumProperty,
  type AltiumPropertiesRecord,
} from "../binary/properties";
import type { AltiumLayers } from "../layers";

/** Source-layer identity determines appearance, independent of object family
 * and registration order. One import shares this resolver across all builders. */
export class AltiumLayerResolver {
  private readonly graphical = new Map<number, DrawingLayer>();
  readonly rawByLayer: Map<number, number>;

  constructor(
    readonly stack: AltiumLayers,
    private readonly board: AltiumPropertiesRecord,
  ) {
    this.rawByLayer = new Map([...stack.v6].map(([raw, id]) => [id, raw]));
  }

  copper(v6: number, v7?: number): number | undefined {
    return (
      (v7 === undefined ? undefined : this.stack.v7.get(v7)) ??
      this.stack.v6.get(v6)
    );
  }

  drawing(raw: number): number {
    const id = 0x20000 + raw;
    if (!this.graphical.has(id)) {
      this.graphical.set(id, {
        id,
        name:
          altiumProperty(this.board, `LAYER${raw}NAME`) ??
          `Altium Layer ${raw}`,
        color: raw === 33 ? "#e3e7d3" : raw === 34 ? "#d8c5d4" : "#a7a9bd",
        layerFunction: "unknown",
        // Top overlay and other graphical layers default to visible. Bottom
        // overlay is hidden consistently for strokes, pads, regions and text.
        defaultVisible: raw !== 34,
      });
    }
    return id;
  }

  get drawings(): DrawingLayer[] {
    return [...this.graphical.values()];
  }
}
