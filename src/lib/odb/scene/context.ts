import type { BoardScene, Point, Segment } from "../../board/model";
import { BoundsAccumulator } from "../../board/bounds";
import { createCopperZone, flattenCopperPaths } from "../../board/copper-zone";
import { OdbPadBuilder } from "./pads";

/** A single ODB import owns its renderer identities and geometry accumulators. */
export class OdbSceneContext {
  private objectId = 1;
  readonly nextId = () => this.objectId++;
  readonly pads: OdbPadBuilder;
  constructor(
    readonly scene: BoardScene,
    readonly extent: BoundsAccumulator,
    readonly signal?: AbortSignal,
  ) {
    this.pads = new OdbPadBuilder(
      scene,
      extent,
      scene.layers.length,
      this.nextId,
    );
  }
  addSegment = (s: Segment, layer: number, net: number, outline = false) => {
    s.id = this.nextId();
    s.trackId = s.id;
    s.layer = layer;
    s.net = net;
    (outline ? this.scene.outline : this.scene.segments).push(s);
    this.extent.includeSegment(s);
  };
  addZone = async (
    paths: Segment[][],
    layer: number,
    net: number,
    flattened?: Point[][],
  ) => {
    if (!paths[0]?.length) return;
    const id = this.nextId();
    const rings = flattened ?? (await flattenCopperPaths(paths, this.signal));
    if (!rings[0] || rings[0].length < 3) return;
    for (const path of paths)
      for (const s of path) {
        s.id = id;
        s.trackId = id;
        s.layer = layer;
        s.net = net;
        this.extent.includeSegment(s);
      }
    this.scene.zones.push(
      await createCopperZone({ id, layer, net, paths, rings }, this.signal),
    );
  };
}
