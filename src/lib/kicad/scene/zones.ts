import { CopperMesh } from "../../board/copper-mesh";
import type { Bounds, Layer, Point, Zone } from "../../board/model";
import { ZoneShape } from "../../board/shapes/zone";
import { PolygonShape } from "../../board/shapes/polygon";
import { cooperative } from "../../cooperative";
import type { KiCadBoardIndex } from "../syntax/index";
import {
  kiCadAtom,
  kiCadChild,
  kiCadChildren,
  kiCadNumber,
  KiCadExpressionReader,
  type KiCadExpression,
} from "../syntax/sexpr";
const required = (node: KiCadExpression, name: string) => {
  const child = kiCadChild(node, name);
  if (!child) throw new Error(`KiCad ${node.head} 缺少 ${name}`);
  return child;
};
const point = (node: KiCadExpression): Point => [
  kiCadNumber(node, 0),
  -kiCadNumber(node, 1),
];
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
    private readonly layers: Layer[],
    private readonly nets: Map<number, string>,
  ) {}
  async build(signal?: AbortSignal): Promise<KiCadZoneModel> {
    const { index, layers, nets } = this;
    const expressions = new KiCadExpressionReader(index.bytes);
    const zones: Zone[] = [],
      bounds: Bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
    const layerIds = new Map(layers.map((layer) => [layer.name, layer.id])),
      netNames = new Map([...nets].map(([id, name]) => [name, id]));
    let nextNet = Math.max(0, ...nets.keys()) + 1,
      sourceFillPolygons = 0,
      sourcePoints = 0,
      unfilledZones = 0,
      keepouts = 0;
    const resolveNet = (node: KiCadExpression) => {
      const field = kiCadChild(node, "net");
      if (!field) return 0;
      const value = kiCadAtom(field);
      if (/^\d+$/.test(value)) {
        const id = Number(value);
        if (id !== 0 && !nets.has(id))
          throw new Error(`KiCad 铜区引用未知网络 ${id}`);
        return id;
      }
      if (!value) return 0;
      let id = netNames.get(value);
      if (id === undefined) {
        id = nextNet++;
        nets.set(id, value);
        netNames.set(value, id);
      }
      return id;
    };
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
      const net = resolveNet(node);
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
        const mesh = await new CopperMesh([ring]).build(signal);
        const boundaryBreaks = new PolygonShape([ring]).bridgeEdges();
        const zone: Zone = {
          id: 0x78000000 + zones.length,
          layer,
          net,
          paths: [],
          rings: [],
          ...mesh,
          ...(boundaryBreaks.length ? { boundaryBreaks } : {}),
        };
        zones.push(zone);
        const box = new ZoneShape(zone).bounds();
        bounds.minX = Math.min(bounds.minX, box.minX);
        bounds.minY = Math.min(bounds.minY, box.minY);
        bounds.maxX = Math.max(bounds.maxX, box.maxX);
        bounds.maxY = Math.max(bounds.maxY, box.maxY);
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
