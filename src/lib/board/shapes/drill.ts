import type { DrillShape as DrillData, PadShape as PadData } from "../model";
import type { PadOwner } from "./pad";
/** Format-independent drill shape; coordinates are in board space. */
export class DrillShape {
  constructor(readonly data: PadOwner) {}
  private static readonly drillPads = new WeakMap<DrillData, PadData | null>();
  pad(): PadData | null {
    const owner = this.data;
    const definition = owner.drillShape,
      cached = definition ? DrillShape.drillPads.get(definition) : undefined;
    if (cached !== undefined) return cached;
    const width = definition?.width ?? owner.drill,
      height = definition?.height ?? owner.drill;
    const pad: PadData | null =
      width <= 0 || height <= 0
        ? null
        : {
            layer: -1,
            type: width === height ? 2 : 11,
            width,
            height,
            offset: [0, 0],
            corner: 0,
          };
    if (definition) DrillShape.drillPads.set(definition, pad);
    return pad;
  }
}
