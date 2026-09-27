import type {
  BoardDrawing,
  Bounds,
  DrawingLayer,
  Pin,
  Segment,
  Via,
} from "../../board/model";
import { SegmentShape } from "../../board/shapes/segment";
import { cooperative } from "../../cooperative";
import type { AltiumLayers } from "../layers";
import { altiumNetId } from "../nets";
import {
  AltiumArcReader,
  AltiumTrackReader,
  AltiumViaReader,
} from "../records/primitives";
import {
  altiumProperty,
  type AltiumPropertiesRecord,
} from "../binary/properties";
export interface AltiumRouteModel {
  segments: Segment[];
  vias: Via[];
  singleLayerPads: Pin[];
  drawings: BoardDrawing[];
  drawingLayers: DrawingLayer[];
  bounds: Bounds;
  sourceTracks: number;
  sourceArcs: number;
  sourceVias: number;
  polygonPrimitives: number;
  unfilledPolygonPrimitives: number;
  keepoutPrimitives: number;
  zeroWidthPrimitives: number;
}
const colors = ["#93aabd", "#b3a591", "#8aa99e", "#a396b6"];
type AltiumRouteInput = {
  streams: {
    tracks: Uint8Array;
    arcs: Uint8Array;
    vias: Uint8Array;
  };
  counts: {
    tracks: number;
    arcs: number;
    vias: number;
  };
  stack: AltiumLayers;
  board: AltiumPropertiesRecord;
  nets: Map<number, string>;
  filledPolygonIds?: Set<number>;
  polygons?: AltiumPropertiesRecord[];
};
type RouteSegmentInput = {
  source: {
    layerV6: number;
    layerV7: number;
    net: number;
    polygon: number;
    keepout: boolean;
  };
  start: Segment["a"];
  end: Segment["b"];
  width: number;
  arc?: Segment["arc"];
};
export class AltiumRouteBuilder {
  constructor(private readonly input: AltiumRouteInput) {}
  async build(signal?: AbortSignal): Promise<AltiumRouteModel> {
    const {
      streams,
      counts,
      stack,
      board,
      nets,
      filledPolygonIds = new Set<number>(),
      polygons = [],
    } = this.input;
    const segments: Segment[] = [],
      vias: Via[] = [],
      singleLayerPads: Pin[] = [],
      drawings: BoardDrawing[] = [],
      drawingLayers: DrawingLayer[] = [],
      drawingIds = new Map<number, number>();
    const bounds: Bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    let polygonPrimitives = 0,
      unfilledPolygonPrimitives = 0,
      keepoutPrimitives = 0,
      zeroWidthPrimitives = 0;
    const pause = cooperative(signal);
    const copperLayer = (v6: number, v7: number) =>
      stack.v7.get(v7) ?? stack.v6.get(v6);
    const rawByLayer = new Map([...stack.v6].map(([raw, id]) => [id, raw]));
    const drawingLayer = (v6: number) => {
      let id = drawingIds.get(v6);
      if (id !== undefined) return id;
      id = 0x20000 + v6;
      drawingIds.set(v6, id);
      const name =
        altiumProperty(board, `LAYER${v6}NAME`) ?? `Altium Layer ${v6}`;
      drawingLayers.push({
        id,
        name,
        color: colors[drawingLayers.length % colors.length],
        layerFunction: "unknown",
        defaultVisible: true,
      });
      return id;
    };
    const include = (box: Bounds) => {
      bounds.minX = Math.min(bounds.minX, box.minX);
      bounds.minY = Math.min(bounds.minY, box.minY);
      bounds.maxX = Math.max(bounds.maxX, box.maxX);
      bounds.maxY = Math.max(bounds.maxY, box.maxY);
    };
    const appendSegment = ({
      source,
      start,
      end,
      width,
      arc,
    }: RouteSegmentInput) => {
      let net = source.net;
      if (source.polygon !== 65535 && source.polygon !== 65534) {
        const polygon = polygons[source.polygon];
        if (!polygon) {
          polygonPrimitives++;
          return;
        }
        if (filledPolygonIds.has(source.polygon)) {
          polygonPrimitives++;
          return;
        }
        unfilledPolygonPrimitives++;
        if (net === 65535) {
          const raw = altiumProperty(polygon, "NET"),
            value = raw === undefined ? -1 : Number(raw);
          if (Number.isSafeInteger(value) && value >= 0 && value < 65535)
            net = value;
        }
      }
      if (source.keepout) {
        keepoutPrimitives++;
        return;
      }
      if (width <= 0) {
        zeroWidthPrimitives++;
        return;
      }
      const copper = copperLayer(source.layerV6, source.layerV7),
        id = 0x40000000 + segments.length + drawings.length;
      const segment: Segment = {
        id,
        trackId: id,
        layer: copper ?? drawingLayer(source.layerV6),
        net: altiumNetId(net, nets),
        a: start,
        b: end,
        width,
      };
      if (arc) segment.arc = arc;
      if (copper !== undefined) {
        segments.push(segment);
        include(new SegmentShape(segment).bounds());
      } else {
        const drawingId = 0x68000000 + drawings.length;
        drawings.push({
          id: drawingId,
          layer: segment.layer,
          net: 0,
          graphicIds: [drawingId],
          segments: [segment],
          texts: [],
        });
      }
    };
    for (const track of new AltiumTrackReader(
      streams.tracks,
      counts.tracks,
    ).records()) {
      if ((track.index & 1023) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      appendSegment({
        source: track,
        start: track.a,
        end: track.b,
        width: track.width,
      });
    }
    for (const source of new AltiumArcReader(
      streams.arcs,
      counts.arcs,
    ).records()) {
      if ((source.index & 511) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      if (!(source.radius > 0) || !Number.isFinite(source.radius))
        throw new Error(`Altium Arc ${source.index} 半径无效`);
      const radians = (degrees: number) => (degrees * Math.PI) / 180;
      const endAngle = radians(source.endDegrees),
        startAngle = radians(source.startDegrees);
      const a: Segment["a"] = [
        source.center[0] + source.radius * Math.cos(endAngle),
        source.center[1] - source.radius * Math.sin(endAngle),
      ];
      const b: Segment["b"] = [
        source.center[0] + source.radius * Math.cos(startAngle),
        source.center[1] - source.radius * Math.sin(startAngle),
      ];
      const sweepDegrees =
        (((source.endDegrees - source.startDegrees) % 360) + 360) % 360;
      const sweep = radians(
        sweepDegrees ||
          (source.startDegrees === 0 && source.endDegrees === 360 ? 360 : 0),
      );
      if (sweep <= 0) {
        zeroWidthPrimitives++;
        continue;
      }
      appendSegment({
        source,
        start: a,
        end: b,
        width: source.width,
        arc: {
          center: source.center,
          radius: source.radius,
          start: -endAngle,
          sweep,
        },
      });
    }
    for (const source of new AltiumViaReader(
      streams.vias,
      counts.vias,
    ).records()) {
      if ((source.index & 511) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const startLayer = stack.v6.get(source.startLayer),
        endLayer = stack.v6.get(source.endLayer);
      if (startLayer === undefined || endLayer === undefined)
        throw new Error(
          `Altium Via ${source.index} 层跨度未定义 ${source.startLayer}→${source.endLayer}`,
        );
      const first = Math.min(startLayer, endLayer),
        last = Math.max(startLayer, endLayer);
      if (source.drill < 0)
        throw new Error(`Altium Via ${source.index} 孔径无效`);
      const pads = [];
      for (let layerId = first; layerId <= last; layerId++) {
        const v6 = rawByLayer.get(layerId);
        let diameter = source.diameter;
        if (source.mode === 1)
          diameter =
            source.diameterByLayer[
              layerId === 0 ? 0 : layerId === stack.layers.length - 1 ? 31 : 1
            ] || diameter;
        else if (source.mode === 2 && v6 !== undefined && v6 <= 32)
          diameter =
            source.diameterByLayer[v6 === 32 ? 31 : v6 - 1] || diameter;
        if (diameter > 0)
          pads.push({
            layer: layerId,
            type: 2,
            width: diameter,
            height: diameter,
            offset: [0, 0] as [number, number],
          });
      }
      if (first === last) {
        if (source.drill !== 0 || pads.length !== 1)
          throw new Error(
            `Altium 单层 Via ${source.index} 不能转换为无孔铜焊盘`,
          );
        singleLayerPads.push({
          id: 0x70000000 + singleLayerPads.length,
          net: altiumNetId(source.net, nets),
          name: "",
          reference: "",
          at: source.at,
          angle: 0,
          back: false,
          drill: 0,
          shapes: pads,
        });
        const radius = pads[0].width / 2;
        include({
          minX: source.at[0] - radius,
          minY: source.at[1] - radius,
          maxX: source.at[0] + radius,
          maxY: source.at[1] + radius,
        });
        continue;
      }
      const via: Via = {
        id: 0x50000000 + vias.length,
        net: altiumNetId(source.net, nets),
        at: source.at,
        padstack: source.index,
        drill: source.drill,
        startLayer: first,
        endLayer: last,
        pads,
      };
      vias.push(via);
      const radius = Math.max(source.diameter, source.drill) / 2;
      include({
        minX: source.at[0] - radius,
        minY: source.at[1] - radius,
        maxX: source.at[0] + radius,
        maxY: source.at[1] + radius,
      });
    }
    return {
      segments,
      vias,
      singleLayerPads,
      drawings,
      drawingLayers,
      bounds,
      sourceTracks: counts.tracks,
      sourceArcs: counts.arcs,
      sourceVias: counts.vias,
      polygonPrimitives,
      unfilledPolygonPrimitives,
      keepoutPrimitives,
      zeroWidthPrimitives,
    };
  }
}
/** Compatibility entry point; parsing state belongs to AltiumRouteBuilder. */
export async function buildAltiumRouteModel(
  streams: {
    tracks: Uint8Array;
    arcs: Uint8Array;
    vias: Uint8Array;
  },
  counts: {
    tracks: number;
    arcs: number;
    vias: number;
  },
  stack: AltiumLayers,
  board: AltiumPropertiesRecord,
  nets: Map<number, string>,
  filledPolygonIds: Set<number> = new Set(),
  polygons: AltiumPropertiesRecord[] = [],
  signal?: AbortSignal,
): Promise<AltiumRouteModel> {
  return new AltiumRouteBuilder({
    streams,
    counts,
    stack,
    board,
    nets,
    filledPolygonIds,
    polygons,
  }).build(signal);
}
