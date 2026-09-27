type BondFingerPlacement = {
  type?: number;
  LayerInfo?: number;
  Unknown5?: number;
};
type BondFingerPadstack = {
  type?: number;
  PadType?: number;
  LayerCount?: number;
  StartLayer?: number;
  Plated?: boolean;
  DrillSize?: number;
  SlotX?: number;
  SlotY?: number;
};
export class AllegroBondFingerDecoder {
  constructor(readonly layerCount: number) {}
  /** camera's native BOND FINGER uses the same 0x33 storage and Via visibility
   * category as vias, but has a one-layer, unplated, undrilled padstack and its
   * own placement rotation. Keep unknown variants diagnostic. */
  placement(record: BondFingerPlacement, stack: BondFingerPadstack) {
    const layerCount = this.layerCount;
    const startLayer = stack.StartLayer,
      rotation = record.Unknown5;
    if (
      record.type !== 0x33 ||
      record.LayerInfo !== 0xc012 ||
      stack.type !== 0x1c ||
      stack.PadType !== 30 ||
      stack.LayerCount !== 1 ||
      typeof startLayer !== "number" ||
      startLayer < 0 ||
      startLayer >= layerCount ||
      stack.Plated ||
      stack.DrillSize !== 0 ||
      stack.SlotX ||
      stack.SlotY ||
      typeof rotation !== "number" ||
      !Number.isInteger(rotation) ||
      rotation < 0 ||
      rotation >= 360000
    )
      return;
    return { angle: (rotation * Math.PI) / 180000, back: false };
  }
}
