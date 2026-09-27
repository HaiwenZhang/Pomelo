import type {
  BoardDrawing,
  Bounds,
  DrawingLayer,
  Point,
  Segment,
  Zone,
} from "../../board/model";
import { CopperMesh } from "../../board/copper-mesh";
import { PointShape } from "../../board/shapes/point";
import { ZoneShape } from "../../board/shapes/zone";
import { cooperative } from "../../cooperative";
import { AltiumFillReader } from "../records/fills";
import type { AltiumLayers } from "../layers";
import { altiumNetId } from "../nets";
import {
  altiumProperty,
  type AltiumPropertiesRecord,
} from "../binary/properties";
export interface AltiumFillModel {
  zones: Zone[];
  drawings: BoardDrawing[];
  drawingLayers: DrawingLayer[];
  bounds: Bounds;
  sourceFills: number;
  keepouts: number;
  degenerate: number;
}
type AltiumFillInput = {
  data: Uint8Array;
  count: number;
  stack: AltiumLayers;
  nets: Map<number, string>;
  board: AltiumPropertiesRecord;
};
export class AltiumFillBuilder {
  constructor(private readonly input: AltiumFillInput) {}
  async build(signal?: AbortSignal): Promise<AltiumFillModel> {
    const { data, count, stack, nets, board } = this.input;
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
    const pause = cooperative(signal);
    let keepouts = 0,
      degenerate = 0;
    for (const source of new AltiumFillReader(data, count).records()) {
      if ((source.index & 63) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      if (source.keepout || source.layer === 56) {
        keepouts++;
        continue;
      }
      const [x1, y1] = source.a,
        [x2, y2] = source.b;
      if (Math.abs(x2 - x1) < 1e-9 || Math.abs(y2 - y1) < 1e-9) {
        degenerate++;
        continue;
      }
      const center: Point = [(x1 + x2) / 2, (y1 + y2) / 2];
      const point = (x: number, y: number): Point => {
        const rotated = new PointShape([x - center[0], y - center[1]]).rotate(
          source.angle,
        );
        return [center[0] + rotated[0], center[1] + rotated[1]];
      };
      const ring = [point(x1, y1), point(x2, y1), point(x2, y2), point(x1, y2)];
      const copper = stack.v6.get(source.layer);
      if (copper !== undefined) {
        const mesh = await new CopperMesh([ring]).build(signal);
        const zone: Zone = {
          id: 0x79000000 + source.index,
          layer: copper,
          net: altiumNetId(source.net, nets),
          paths: [],
          rings: [],
          ...mesh,
        };
        zones.push(zone);
        const box = new ZoneShape(zone).bounds();
        bounds.minX = Math.min(bounds.minX, box.minX);
        bounds.minY = Math.min(bounds.minY, box.minY);
        bounds.maxX = Math.max(bounds.maxX, box.maxX);
        bounds.maxY = Math.max(bounds.maxY, box.maxY);
      } else {
        const layer = 0x20000 + source.layer,
          id = 0x6b000000 + source.index;
        if (!drawingLayerIds.has(layer)) {
          drawingLayerIds.add(layer);
          drawingLayers.push({
            id: layer,
            name:
              altiumProperty(board, `LAYER${source.layer}NAME`) ??
              `Altium Layer ${source.layer}`,
            color: "#a7a9bd",
            layerFunction: "unknown",
            defaultVisible: true,
          });
        }
        const segments: Segment[] = ring.map((a, i) => ({
          id: 0x6c000000 + source.index * 4 + i,
          trackId: id,
          layer,
          net: 0,
          a,
          b: ring[(i + 1) % 4],
          width: 0.05,
        }));
        drawings.push({
          id,
          layer,
          net: 0,
          graphicIds: [id],
          segments,
          texts: [],
        });
      }
    }
    return {
      zones,
      drawings,
      drawingLayers,
      bounds,
      sourceFills: count,
      keepouts,
      degenerate,
    };
  }
}
/** Compatibility entry point; parsing state belongs to AltiumFillBuilder. */
export async function buildAltiumFillModel(
  data: Uint8Array,
  count: number,
  stack: AltiumLayers,
  nets: Map<number, string>,
  board: AltiumPropertiesRecord,
  signal?: AbortSignal,
): Promise<AltiumFillModel> {
  return new AltiumFillBuilder({ data, count, stack, nets, board }).build(
    signal,
  );
}
