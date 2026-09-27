import type { PadShape as PadData, Via } from "../model";
/** Format-independent via shape; coordinates are in board space. */
export class ViaShape {
  constructor(readonly data: Via) {}
  private static readonly padLayers = new WeakMap<
    PadData[],
    readonly number[]
  >();
  private static readonly drilledLayers = new WeakMap<
    PadData[],
    readonly number[]
  >();
  isThrough(layerCount: number) {
    const via = this.data;
    return (
      layerCount > 1 && via.startLayer === 0 && via.endLayer === layerCount - 1
    );
  }
  backdrillLayers(): readonly number[] {
    const via = this.data;
    let layers = ViaShape.drilledLayers.get(via.pads);
    if (!layers) {
      layers = via.pads.filter((p) => p.backdrill).map((p) => p.layer);
      ViaShape.drilledLayers.set(via.pads, layers);
    }
    return layers;
  }
  /** Both through and BB holes need a visible Via pad layer. DemoCase's
   * Ncdrill_Figure / Nclegend-1-8 can otherwise mask this dependency; isolate
   * those manufacturing symbols before comparing the copper-layer controls. */
  drillLayers(_layerCount: number): readonly number[] {
    const via = this.data;
    let layers = ViaShape.padLayers.get(via.pads);
    if (!layers) {
      layers = [...new Set(via.pads.map((p) => p.layer))].sort((a, b) => a - b);
      ViaShape.padLayers.set(via.pads, layers);
    }
    return layers;
  }
}
