import { KiCadSceneContext } from "./context";
import { kiCadRequired as required, kiCadPosition as point } from "./fields";
import { BoundsAccumulator } from "../../board/bounds";
import { createCopperZone } from "../../board/copper-zone";
import type { Bounds, Layer, Zone } from "../../board/model";

import { PolygonShape } from "../../board/shapes/polygon";
import { cooperative } from "../../cooperative";
import { splitKiCadFillRing } from "./fill-rings";
import type { KiCadBoardIndex } from "../syntax/index";
import {
  kiCadAtom,
  kiCadChild,
  kiCadChildren,
  KiCadExpressionReader,
} from "../syntax/sexpr";
export interface KiCadZoneModel {
  zones: Zone[];
  bounds: Bounds;
  sourceZones: number;
  sourceFillPolygons: number;
  sourcePoints: number;
  unfilledZones: number;
  keepouts: number;
}
/** Render only saved filled polygons. Design contours and keepouts are not
 * reconstructed into copper when the source has no fill cache. */
export class KiCadZoneBuilder {
  constructor(
    private readonly index: KiCadBoardIndex,
    layers: Layer[],
    nets: Map<number, string>,
    private readonly context = new KiCadSceneContext(layers, nets),
  ) {}
  async build(signal?: AbortSignal): Promise<KiCadZoneModel> {
    const { index } = this;
    const expressions = new KiCadExpressionReader(index.bytes);
    const zones: Zone[] = [],
      extent = new BoundsAccumulator(),
      bounds = extent.bounds;
    const { layerIds } = this.context;
    let sourceFillPolygons = 0,
      sourcePoints = 0,
      unfilledZones = 0,
      keepouts = 0;
    const spans = index.items.get("zone") ?? [],
      pause = cooperative(signal);
    for (let i = 0; i < spans.length; i++) {
      if ((i & 15) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const span = spans[i],
        node = expressions.read(span),
        fills = kiCadChildren(node, "filled_polygon");
      if (kiCadChild(node, "keepout")) keepouts++;
      if (!fills.length) {
        unfilledZones++;
        continue;
      }
      const net = this.context.net(node);
      for (const fill of fills) {
        sourceFillPolygons++;
        const layerName = kiCadAtom(required(fill, "layer")),
          layer = layerIds.get(layerName);
        if (layer === undefined)
          throw new Error(
            `KiCad 铜区填充引用未知层 ${layerName} @${span.start}`,
          );
        const ring = kiCadChildren(required(fill, "pts"), "xy").map(point);
        sourcePoints += ring.length;
        if (ring.length < 3)
          throw new Error(`KiCad 铜区填充点数不足 @${span.start}`);
        const rings = splitKiCadFillRing(ring);
        const boundaryBreaks =
          rings.length === 1
            ? new PolygonShape(rings).bridgeEdges()
            : new Uint32Array(0);
        const zone = await createCopperZone(
          {
            id: 0x78000000 + zones.length,
            layer,
            net,
            rings,
            boundaryBreaks,
          },
          signal,
        );
        zones.push(zone);
        extent.includeZone(zone);
      }
    }
    return {
      zones,
      bounds,
      sourceZones: spans.length,
      sourceFillPolygons,
      sourcePoints,
      unfilledZones,
      keepouts,
    };
  }
}
/** Compatibility entry point; parsing state belongs to KiCadZoneBuilder. */
export async function buildKiCadZones(
  index: KiCadBoardIndex,
  layers: Layer[],
  nets: Map<number, string>,
  signal?: AbortSignal,
): Promise<KiCadZoneModel> {
  return new KiCadZoneBuilder(index, layers, nets).build(signal);
}
