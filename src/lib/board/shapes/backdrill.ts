import type { BackdrillDefinition, PadShape } from "../model";
/** Board-space backdrill spans; source record decoding belongs to the importer. */
export class BackdrillShape {
  constructor(readonly data: Pick<BackdrillDefinition, "spans">) {}
  containsLayer(layer: number): boolean {
    return this.data.spans.some(
      (span) =>
        layer >= Math.min(span.startLayer, span.stopLayer) &&
        layer <= Math.max(span.startLayer, span.stopLayer),
    );
  }
  label(): string {
    return this.data.spans
      .map(
        (span) =>
          `B${span.startLayer + 1}-${span.stopLayer + 1}-${span.protectedLayer + 1}`,
      )
      .join(",");
  }
  /** START sets the entry diameter; interior cut pads remain limited by START. */
  static applyPads(
    pads: PadShape[],
    definition: BackdrillDefinition,
  ): PadShape[] {
    const shape = new BackdrillShape(definition);
    const effective = pads.filter((pad) => !shape.containsLayer(pad.layer));
    for (const span of definition.spans) {
      for (
        let layer = Math.min(span.startLayer, span.stopLayer);
        layer <= Math.max(span.startLayer, span.stopLayer);
        layer++
      ) {
        const ordinary = pads.find((pad) => pad.layer === layer);
        const base =
          layer === span.startLayer
            ? definition.startPadDiameter
            : Math.min(definition.startPadDiameter, ordinary?.width ?? 0);
        if (base > 0)
          effective.push({
            layer,
            type: 2,
            width: base,
            height: base,
            offset: [0, 0],
            backdrillBase: true,
          });
        effective.push({
          layer,
          type: 2,
          width: definition.displayDiameter,
          height: definition.displayDiameter,
          offset: [0, 0],
          backdrill: true,
        });
      }
    }
    return effective.sort((a, b) => a.layer - b.layer);
  }
}
