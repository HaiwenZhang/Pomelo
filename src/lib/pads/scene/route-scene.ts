import { PadsLayerMap } from "./layer-map";
import type { Segment } from "../../board/model";
import type { PadsLayer } from "../binary/metadata";
import type { PadsRoute } from "../binary/routes";
import { cooperative } from "../../cooperative";
export class PadsRouteBuilder {
  constructor(
    private readonly routes: PadsRoute[],
    layers: PadsLayer[],
    private readonly layerMap = new PadsLayerMap(layers),
  ) {}
  async build(signal?: AbortSignal) {
    const { routes } = this;
    const pause = cooperative(signal);
    signal?.throwIfAborted();
    const physical = this.layerMap.physical,
      segments: Segment[] = [],
      objects = new Set<number>();
    for (const route of routes) {
      if (objects.has(route.object)) throw new Error("PADS 重复走线对象");
      objects.add(route.object);
      const layer = physical.get(route.layer);
      if (
        layer === undefined ||
        !Number.isFinite(route.width) ||
        route.width <= 0 ||
        !Number.isInteger(route.net) ||
        route.net < 0
      )
        throw new Error(`PADS 走线场景属性无效 ${route.object}`);
      for (let i = 1; i < route.points.length; i++) {
        if (segments.length % 512 === 0) {
          const pending = pause();
          if (pending) await pending;
        }
        const a = route.points[i - 1],
          b = route.points[i];
        if (![...a, ...b].every(Number.isFinite))
          throw new Error("PADS 非有限走线坐标");
        if (a[0] === b[0] && a[1] === b[1]) continue;
        segments.push({
          id: 0x40000000 + segments.length,
          trackId: 0x3e000000 + route.object,
          layer,
          net: route.net + 1,
          a,
          b,
          width: route.width,
        });
      }
    }
    return segments;
  }
}
/** Compatibility entry point; parsing state belongs to PadsRouteBuilder. */
export async function buildPadsRouteSegments(
  routes: PadsRoute[],
  layers: PadsLayer[],
  signal?: AbortSignal,
) {
  return new PadsRouteBuilder(routes, layers).build(signal);
}
