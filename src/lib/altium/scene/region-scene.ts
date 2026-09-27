import type {
  BoardDrawing,
  Bounds,
  DrawingLayer,
  Segment,
  Zone,
} from "../../board/model";
import { CopperMesh } from "../../board/copper-mesh";
import { ZoneShape } from "../../board/shapes/zone";
import { cooperative } from "../../cooperative";
import type { AltiumLayers } from "../layers";
import { altiumNetId } from "../nets";
import {
  altiumProperty,
  type AltiumPropertiesRecord,
} from "../binary/properties";
import { AltiumRegionReader } from "../records/regions";
export interface AltiumRegionModel {
  zones: Zone[];
  drawings: BoardDrawing[];
  drawingLayers: DrawingLayer[];
  bounds: Bounds;
  sourceRegions: number;
  filledRegions: number;
  filledPolygons: number;
  filledPolygonIds: Set<number>;
  nonCopperRegions: number;
  otherRegions: number;
  sourceVertices: number;
}
/** Use saved Region6 contours as copper. Polygon6 design outlines are not
 * silently poured: only source fill records produce Zone geometry. */
type AltiumRegionInput = {
  data: Uint8Array;
  count: number;
  stack: AltiumLayers;
  nets: Map<number, string>;
  polygons: AltiumPropertiesRecord[];
  board: AltiumPropertiesRecord;
};
export class AltiumRegionBuilder {
  constructor(private readonly input: AltiumRegionInput) {}
  async build(signal?: AbortSignal): Promise<AltiumRegionModel> {
    const { data, count, stack, nets, polygons, board } = this.input;
    const zones: Zone[] = [],
      drawings: BoardDrawing[] = [],
      drawingLayers: DrawingLayer[] = [];
    const drawingLayerIds = new Set<number>();
    const bounds: Bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    let nonCopperRegions = 0,
      otherRegions = 0,
      sourceVertices = 0;
    const filledPolygonIds = new Set<number>();
    const pause = cooperative(signal);
    let edgeId = 0;
    for (const region of new AltiumRegionReader(data, count).records()) {
      if ((region.index & 63) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      sourceVertices +=
        region.outline.length +
        region.holes.reduce((sum, hole) => sum + hole.length, 0);
      if (region.kind !== 0 || region.keepout || region.boardCutout) {
        otherRegions++;
        continue;
      }
      const layer = stack.v6.get(region.layer);
      if (layer === undefined) {
        nonCopperRegions++;
        const drawLayer = 0x20000 + region.layer,
          id = 0x6d000000 + region.index;
        if (!drawingLayerIds.has(drawLayer)) {
          drawingLayerIds.add(drawLayer);
          drawingLayers.push({
            id: drawLayer,
            name:
              altiumProperty(board, `LAYER${region.layer}NAME`) ??
              `Altium Layer ${region.layer}`,
            color: "#a7a9bd",
            layerFunction: "unknown",
            defaultVisible: false,
          });
        }
        const segments: Segment[] = [];
        for (const ring of [region.outline, ...region.holes])
          for (let i = 0; i < ring.length; i++)
            segments.push({
              id: 0x6e000000 + edgeId++,
              trackId: id,
              layer: drawLayer,
              net: 0,
              a: ring[i],
              b: ring[(i + 1) % ring.length],
              width: 0.05,
            });
        drawings.push({
          id,
          layer: drawLayer,
          net: 0,
          graphicIds: [id],
          segments,
          texts: [],
        });
        continue;
      }
      let net = region.net;
      if (net === 0xffff && region.polygon !== 0xffff) {
        const polygon = polygons[region.polygon];
        if (!polygon)
          throw new Error(
            `Altium Region ${region.index} Polygon 引用越界 ${region.polygon}`,
          );
        const raw = altiumProperty(polygon, "NET");
        if (raw !== undefined) {
          const value = Number(raw);
          if (Number.isSafeInteger(value) && value >= 0 && value < 0xffff)
            net = value;
        }
      }
      const mesh = await new CopperMesh([
        region.outline,
        ...region.holes,
      ]).build(signal);
      const zone: Zone = {
        id: 0x78000000 + region.index,
        layer,
        net: altiumNetId(net, nets),
        paths: [],
        rings: [],
        ...mesh,
      };
      zones.push(zone);
      if (region.polygon !== 0xffff) filledPolygonIds.add(region.polygon);
      const box = new ZoneShape(zone).bounds();
      bounds.minX = Math.min(bounds.minX, box.minX);
      bounds.minY = Math.min(bounds.minY, box.minY);
      bounds.maxX = Math.max(bounds.maxX, box.maxX);
      bounds.maxY = Math.max(bounds.maxY, box.maxY);
    }
    return {
      zones,
      drawings,
      drawingLayers,
      bounds,
      sourceRegions: count,
      filledRegions: zones.length,
      filledPolygons: filledPolygonIds.size,
      filledPolygonIds,
      nonCopperRegions,
      otherRegions,
      sourceVertices,
    };
  }
}
/** Compatibility entry point; parsing state belongs to AltiumRegionBuilder. */
export async function buildAltiumRegionModel(
  data: Uint8Array,
  count: number,
  stack: AltiumLayers,
  nets: Map<number, string>,
  polygons: AltiumPropertiesRecord[],
  board: AltiumPropertiesRecord,
  signal?: AbortSignal,
): Promise<AltiumRegionModel> {
  return new AltiumRegionBuilder({
    data,
    count,
    stack,
    nets,
    polygons,
    board,
  }).build(signal);
}
