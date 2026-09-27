import type {
  BoardDrawing,
  Bounds,
  DrawingLayer,
  PadShape,
  Pin,
  Point,
  Segment,
} from "../../board/model";
import { PadShape as PadShapeGeometry } from "../../board/shapes/pad";
import { PointShape } from "../../board/shapes/point";
import { cooperative } from "../../cooperative";
import type { AltiumLayers } from "../layers";
import { altiumNetId } from "../nets";
import {
  AltiumPadReader,
  type AltiumPad,
  type AltiumPadGeometry,
} from "../records/pads";
import {
  altiumProperty,
  type AltiumPropertiesRecord,
} from "../binary/properties";
export interface AltiumPadModel {
  pins: Pin[];
  drawings: BoardDrawing[];
  drawingLayers: DrawingLayer[];
  bounds: Bounds;
  sourcePads: number;
  nonCopperPads: number;
  unsupportedShapes: number;
  unsupportedHoles: number;
  offsetHoles: number;
  rotatedSlots: number;
}
/** Resolve Altium's top / 30 signal-layer / bottom padstack slots. Internal
 * planes do not occupy a slot and inherit the middle geometry. */
function stackIndex(raw: number): number {
  if (raw === 32) return 31;
  return raw >= 1 && raw <= 31 ? raw - 1 : -1;
}
type AltiumPadInput = {
  data: Uint8Array;
  count: number;
  stack: AltiumLayers;
  nets: Map<number, string>;
  components: AltiumPropertiesRecord[];
  board: AltiumPropertiesRecord;
};
export class AltiumPadBuilder {
  constructor(private readonly input: AltiumPadInput) {}
  async build(signal?: AbortSignal): Promise<AltiumPadModel> {
    const { data, count, stack, nets, components, board } = this.input;
    const pins: Pin[] = [],
      drawings: BoardDrawing[] = [],
      drawingLayers: DrawingLayer[] = [],
      bounds: Bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
    const rawByLayer = new Map([...stack.v6].map(([raw, id]) => [id, raw]));
    const pause = cooperative(signal);
    let nonCopperPads = 0,
      unsupportedShapes = 0,
      unsupportedHoles = 0,
      offsetHoles = 0,
      rotatedSlots = 0;
    const drawingIds = new Set<number>();
    const drawNonCopper = (source: AltiumPad) => {
      const layer = 0x20000 + source.layer,
        id = 0x69000000 + source.index;
      if (!drawingIds.has(layer)) {
        drawingIds.add(layer);
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
      const width = source.top.width,
        height = source.top.height;
      if (width <= 0 || height <= 0) return;
      const angle = (-source.angle * Math.PI) / 180,
        segments: Segment[] = [],
        at = source.at;
      const point = (x: number, y: number): Point => {
        const rotated = new PointShape([x, y]).rotate(angle);
        return [at[0] + rotated[0], at[1] + rotated[1]];
      };
      const edge = (a: Point, b: Point, arc?: Segment["arc"]) => {
        const key = 0x6a000000 + source.index * 32 + segments.length;
        segments.push({
          id: key,
          trackId: id,
          layer,
          net: 0,
          a,
          b,
          width: 0.05,
          ...(arc ? { arc } : {}),
        });
      };
      if (source.top.shape === 1 && width === height) {
        const radius = width / 2,
          circumferencePoint: Point = [at[0] + radius, at[1]];
        edge(circumferencePoint, circumferencePoint, {
          center: at,
          radius,
          start: 0,
          sweep: Math.PI * 2,
        });
      } else {
        const corners: Point[] =
          source.top.shape === 1
            ? Array.from({ length: 24 }, (_, i) =>
                point(
                  (width / 2) * Math.cos((i * Math.PI) / 12),
                  (height / 2) * Math.sin((i * Math.PI) / 12),
                ),
              )
            : source.top.shape === 3
              ? [
                  point(-width / 2, -height / 4),
                  point(-width / 4, -height / 2),
                  point(width / 4, -height / 2),
                  point(width / 2, -height / 4),
                  point(width / 2, height / 4),
                  point(width / 4, height / 2),
                  point(-width / 4, height / 2),
                  point(-width / 2, height / 4),
                ]
              : [
                  point(-width / 2, -height / 2),
                  point(width / 2, -height / 2),
                  point(width / 2, height / 2),
                  point(-width / 2, height / 2),
                ];
        for (let i = 0; i < corners.length; i++)
          edge(corners[i], corners[(i + 1) % corners.length]);
      }
      drawings.push({
        id,
        layer,
        net: 0,
        graphicIds: [id],
        segments,
        texts: [],
      });
    };
    const shape = (
      source: AltiumPad,
      geometry: AltiumPadGeometry,
      layer: number,
      slot: number,
    ): PadShape | null => {
      const { width, height } = geometry;
      if (width <= 0 || height <= 0) return null;
      let type: number, corner: number | undefined;
      if (geometry.shape === 1) {
        if (source.altShapes[slot] === 9) {
          type = 27;
          corner = (Math.min(width, height) * source.cornerRadii[slot]) / 200;
        } else type = width === height ? 2 : 11;
      } else if (geometry.shape === 2) type = 6;
      else if (geometry.shape === 3) type = 3;
      else {
        unsupportedShapes++;
        return null;
      }
      const offset = source.holeOffsets[slot] ?? [0, 0];
      return { layer, type, width, height, offset, corner };
    };
    for (const source of new AltiumPadReader(data, count).records()) {
      if ((source.index & 255) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const layers =
        source.layer === 74
          ? stack.layers.map((row) => row.id)
          : [stack.v6.get(source.layer)].filter(
              (id): id is number => id !== undefined,
            );
      if (!layers.length) {
        nonCopperPads++;
        drawNonCopper(source);
        continue;
      }
      const shapes: PadShape[] = [];
      for (const layer of layers) {
        const raw = rawByLayer.get(layer);
        if (raw === undefined)
          throw new Error(
            `Altium Pad ${source.index} 层 ${layer} 缺少原始层号`,
          );
        const slot = stackIndex(raw);
        let geometry = source.top;
        if (source.mode === 1) {
          geometry =
            layer === 0
              ? source.top
              : layer === stack.layers.length - 1
                ? source.bottom
                : source.middle;
        } else if (source.mode === 2) {
          geometry =
            layer === 0
              ? source.top
              : layer === stack.layers.length - 1
                ? source.bottom
                : raw >= 39 || raw === 2
                  ? source.middle
                  : (source.inner[raw - 3] ?? source.middle);
        }
        const pad = shape(source, geometry, layer, slot < 0 ? 1 : slot);
        if (pad) shapes.push(pad);
      }
      if (![0, 1, 2].includes(source.mode))
        throw new Error(
          `Altium Pad ${source.index} padstack 模式未支持 ${source.mode}`,
        );
      if (source.holeOffsets.some(([x, y]) => x !== 0 || y !== 0))
        offsetHoles++;
      let drillShape: Pin["drillShape"];
      if (source.drill > 0) {
        if (source.holeShape === 2) {
          const angle = ((source.slotRotation % 180) + 180) % 180;
          if (Math.abs(angle) > 1e-6 && Math.abs(angle - 90) > 1e-6)
            rotatedSlots++;
          const vertical = Math.abs(angle - 90) < 1e-6;
          drillShape = {
            width: vertical ? source.drill : source.slotSize,
            height: vertical ? source.slotSize : source.drill,
            plated: source.plated,
          };
        } else {
          if (source.holeShape !== 0 && source.holeShape !== 1)
            unsupportedHoles++;
          drillShape = {
            width: source.drill,
            height: source.drill,
            plated: source.plated,
          };
        }
      }
      const component =
        source.component === 0xffff ? undefined : components[source.component];
      if (source.component !== 0xffff && !component)
        throw new Error(
          `Altium Pad ${source.index} 器件引用越界 ${source.component}`,
        );
      const pin: Pin = {
        id: 0x60000000 + source.index,
        net: altiumNetId(source.net, nets),
        name: source.name,
        reference: component
          ? (altiumProperty(component, "SOURCEDESIGNATOR") ??
            altiumProperty(component, "DESIGNATOR") ??
            "")
          : "",
        at: source.at,
        angle: (-source.angle * Math.PI) / 180,
        back: source.layer === 32,
        drill: source.drill,
        drillShape,
        shapes,
      };
      pins.push(pin);
      for (const pad of shapes) {
        const box = new PadShapeGeometry(pad).bounds(pin);
        bounds.minX = Math.min(bounds.minX, box.minX);
        bounds.minY = Math.min(bounds.minY, box.minY);
        bounds.maxX = Math.max(bounds.maxX, box.maxX);
        bounds.maxY = Math.max(bounds.maxY, box.maxY);
      }
    }
    return {
      pins,
      drawings,
      drawingLayers,
      bounds,
      sourcePads: count,
      nonCopperPads,
      unsupportedShapes,
      unsupportedHoles,
      offsetHoles,
      rotatedSlots,
    };
  }
}
/** Compatibility entry point; parsing state belongs to AltiumPadBuilder. */
export async function buildAltiumPadModel(
  data: Uint8Array,
  count: number,
  stack: AltiumLayers,
  nets: Map<number, string>,
  components: AltiumPropertiesRecord[],
  board: AltiumPropertiesRecord,
  signal?: AbortSignal,
): Promise<AltiumPadModel> {
  return new AltiumPadBuilder({
    data,
    count,
    stack,
    nets,
    components,
    board,
  }).build(signal);
}
