import type { BoardScene, Layer } from "./model";
export const BOND_TOP_LAYER = 0x20000;
export const BOND_WIRE_TOP_LAYER = 0x20001;
/** Visual layers are cached separately from the physical stackup used by drills. */
export class BoardLayers {
  constructor(readonly data: BoardScene) {}
  private static readonly combined = new WeakMap<
    BoardScene,
    readonly Layer[]
  >();
  all(): readonly Layer[] {
    const scene = this.data;
    if (!scene.specialLayers?.length) return scene.layers;
    let layers = BoardLayers.combined.get(scene);
    if (!layers) {
      layers = [...scene.layers, ...scene.specialLayers];
      BoardLayers.combined.set(scene, layers);
    }
    return layers;
  }
  name(id: number) {
    const scene = this.data;
    return (
      this.all().find((layer) => layer.id === id)?.name ??
      scene.drawingLayers.find((layer) => layer.id === id)?.name ??
      (id === -1 ? "钻孔" : `Layer ${id + 1}`)
    );
  }
}
