import type { PadsLayer } from "../binary/metadata";

/** Ordered copper and source-to-scene identity are shared by all object families. */
export class PadsLayerMap {
  readonly copper: PadsLayer[];
  readonly physical: Map<number, number>;
  constructor(layers: PadsLayer[]) {
    this.copper = layers.filter((layer) => layer.type === 1);
    this.physical = new Map(this.copper.map((layer, id) => [layer.id, id]));
  }
}
