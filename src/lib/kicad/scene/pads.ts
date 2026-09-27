import type { Bounds, Layer, PadShape, Pin, Point } from "../../board/model";
import { DrillShape } from "../../board/shapes/drill";
import { PadShape as PadShapeGeometry } from "../../board/shapes/pad";
import { PointShape } from "../../board/shapes/point";
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
const position = (node: KiCadExpression): Point => [
  kiCadNumber(node, 0),
  -kiCadNumber(node, 1),
];
const number = (node: KiCadExpression, index: number, otherwise = 0) =>
  node.values.length > index ? kiCadNumber(node, index) : otherwise;
const shapeType = (name: string) => {
  const type: Record<string, number> = {
    circle: 2,
    rect: 6,
    oval: 11,
    roundrect: 27,
    custom: 22,
  };
  const id = type[name];
  if (id === undefined) throw new Error(`KiCad 焊盘形状未支持 ${name}`);
  return id;
};
export interface KiCadPadModel {
  pins: Pin[];
  bounds: Bounds;
  sourceFootprints: number;
  sourcePads: number;
  customPads: number;
  zeroCopperPads: number;
  offsetDrills: number;
  layerOverrides: number;
}
/** Footprint pads are local to their parent footprint. Pad orientation in a
 * KiCad board file is absolute in the board frame (KiCad parser, T_at). */
export class KiCadPadBuilder {
  constructor(
    private readonly index: KiCadBoardIndex,
    private readonly layers: Layer[],
    private readonly nets: Map<number, string>,
  ) {}
  async build(signal?: AbortSignal): Promise<KiCadPadModel> {
    const { index, layers, nets } = this;
    const expressions = new KiCadExpressionReader(index.bytes);
    const layerIds = new Map(layers.map((layer) => [layer.name, layer.id]));
    const netNames = new Map([...nets].map(([id, name]) => [name, id]));
    let nextNet = Math.max(0, ...nets.keys()) + 1;
    const resolveNet = (pad: KiCadExpression) => {
      const field = kiCadChild(pad, "net");
      if (!field) return 0;
      const value = kiCadAtom(field);
      if (/^\d+$/.test(value)) {
        const id = Number(value);
        if (id !== 0 && !nets.has(id))
          throw new Error(`KiCad 焊盘引用未知网络 ${id}`);
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
    const copperLayers = (field: KiCadExpression) => {
      const ids = new Set<number>();
      for (const value of field.values) {
        if (typeof value !== "string") throw new Error("KiCad 焊盘层字段无效");
        if (value === "*.Cu") for (const layer of layers) ids.add(layer.id);
        else if (value === "F&B.Cu") {
          ids.add(0);
          ids.add(layers.length - 1);
        } else if (value.endsWith(".Cu")) {
          const id = layerIds.get(value);
          if (id === undefined)
            throw new Error(`KiCad 焊盘引用未知铜层 ${value}`);
          ids.add(id);
        }
      }
      return [...ids].sort((a, b) => a - b);
    };
    const pins: Pin[] = [],
      bounds: Bounds = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
    let sourcePads = 0,
      customPads = 0,
      zeroCopperPads = 0,
      offsetDrills = 0,
      layerOverrides = 0;
    const include = (box: Bounds) => {
      bounds.minX = Math.min(bounds.minX, box.minX);
      bounds.minY = Math.min(bounds.minY, box.minY);
      bounds.maxX = Math.max(bounds.maxX, box.maxX);
      bounds.maxY = Math.max(bounds.maxY, box.maxY);
    };
    const pause = cooperative(signal),
      footprints = index.items.get("footprint") ?? [];
    for (
      let footprintIndex = 0;
      footprintIndex < footprints.length;
      footprintIndex++
    ) {
      if ((footprintIndex & 31) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const span = footprints[footprintIndex],
        fp = expressions.read(span);
      const origin = position(required(fp, "at")),
        rotation = (number(required(fp, "at"), 2) * Math.PI) / 180;
      const back = kiCadAtom(required(fp, "layer")) === "B.Cu";
      const reference = kiCadChildren(fp, "property").find(
        (property) => kiCadAtom(property) === "Reference",
      );
      const legacy = kiCadChildren(fp, "fp_text").find(
        (value) => kiCadAtom(value) === "reference",
      );
      const ref = reference
        ? kiCadAtom(reference, 1)
        : legacy
          ? kiCadAtom(legacy, 1)
          : `FP${footprintIndex + 1}`;
      for (const pad of kiCadChildren(fp, "pad")) {
        const sourceId = sourcePads++,
          name = kiCadAtom(pad),
          kind = kiCadAtom(pad, 1),
          shapeName = kiCadAtom(pad, 2);
        if (!["smd", "thru_hole", "np_thru_hole", "connect"].includes(kind))
          throw new Error(`KiCad 焊盘类型未支持 ${kind} @${span.start}`);
        const local = position(required(pad, "at")),
          shift = new PointShape(local).rotate(rotation),
          at: Point = [origin[0] + shift[0], origin[1] + shift[1]];
        const angle = (number(required(pad, "at"), 2) * Math.PI) / 180;
        const size = required(pad, "size"),
          baseWidth = kiCadNumber(size, 0),
          baseHeight = kiCadNumber(size, 1);
        if (baseWidth < 0 || baseHeight < 0)
          throw new Error(
            `KiCad 焊盘尺寸无效 @${span.start} ${JSON.stringify({ ref, name, kind, shapeName, baseWidth, baseHeight })}`,
          );
        const layersForPad = copperLayers(required(pad, "layers"));
        const drill = kiCadChild(pad, "drill");
        let drillWidth = 0,
          drillHeight = 0;
        if (drill) {
          const oval = kiCadAtom(drill) === "oval";
          drillWidth = kiCadNumber(drill, oval ? 1 : 0);
          drillHeight = oval ? kiCadNumber(drill, 2) : drillWidth;
          if (!(drillWidth > 0) || !(drillHeight > 0))
            throw new Error(`KiCad 焊盘孔尺寸无效 @${span.start}`);
          if (kiCadChild(drill, "offset")) offsetDrills++;
        }
        const padstack = kiCadChild(pad, "padstack"),
          overrides = new Map<
            number,
            {
              shape: string;
              width: number;
              height: number;
            }
          >();
        if (padstack) {
          for (const value of kiCadChildren(padstack, "layer")) {
            const layerName = kiCadAtom(value),
              shape = kiCadAtom(required(value, "shape"));
            const dim = required(value, "size"),
              width = kiCadNumber(dim, 0),
              height = kiCadNumber(dim, 1);
            const targets =
              layerName === "Inner"
                ? layersForPad.filter(
                    (id) => id !== 0 && id !== layers.length - 1,
                  )
                : layerName === "F.Cu"
                  ? [0]
                  : layerName === "B.Cu"
                    ? [layers.length - 1]
                    : [];
            if (!targets.length)
              throw new Error(`KiCad 焊盘 Padstack 层未支持 ${layerName}`);
            for (const id of targets) {
              overrides.set(id, { shape, width, height });
              layerOverrides++;
            }
          }
        }
        const custom: Point[][] = [];
        if (shapeName === "custom") {
          customPads++;
          const primitives = required(pad, "primitives");
          for (const primitive of primitives.values) {
            if (typeof primitive === "string")
              throw new Error("KiCad 自定义焊盘图元无效");
            if (primitive.head !== "gr_poly")
              throw new Error(`KiCad 自定义焊盘图元未支持 ${primitive.head}`);
            const vertices = kiCadChildren(
              required(primitive, "pts"),
              "xy",
            ).map(position);
            if (vertices.length < 3)
              throw new Error("KiCad 自定义焊盘多边形点数不足");
            custom.push(vertices.map(([x, y]) => [x, back ? -y : y]));
          }
          if (!custom.length) throw new Error("KiCad 自定义焊盘没有有效图元");
        }
        const shapes: PadShape[] = layersForPad.flatMap((layer) => {
          const override = overrides.get(layer),
            shape = override?.shape ?? shapeName,
            width = override?.width ?? baseWidth,
            height = override?.height ?? baseHeight;
          if (width <= 0 || height <= 0) return [];
          const result: PadShape = {
            layer,
            type: shapeType(shape),
            width,
            height,
            offset: [0, 0],
          };
          if (shape === "roundrect")
            result.corner =
              number(required(pad, "roundrect_rratio"), 0) *
              Math.min(width, height);
          if (shape === "custom") result.custom = custom;
          if (shape === "circle" && Math.abs(width - height) > 1e-6)
            throw new Error("KiCad 圆形焊盘宽高不等");
          return [result];
        });
        if (shapes.length === 0) zeroCopperPads++;
        const id = 0x70000000 + sourceId,
          pin: Pin = {
            id,
            net: resolveNet(pad),
            name,
            reference: ref,
            at,
            angle,
            back,
            drill: Math.max(drillWidth, drillHeight),
            shapes,
          };
        if (drill)
          pin.drillShape = {
            width: drillWidth,
            height: drillHeight,
            plated: kind !== "np_thru_hole",
          };
        pins.push(pin);
        for (const shape of shapes)
          include(new PadShapeGeometry(shape).bounds(pin));
        const hole = new DrillShape(pin).pad();
        if (hole) include(new PadShapeGeometry(hole).bounds(pin));
      }
    }
    return {
      pins,
      bounds,
      sourceFootprints: footprints.length,
      sourcePads,
      customPads,
      zeroCopperPads,
      offsetDrills,
      layerOverrides,
    };
  }
}
/** Compatibility entry point; parsing state belongs to KiCadPadBuilder. */
export async function buildKiCadPads(
  index: KiCadBoardIndex,
  layers: Layer[],
  nets: Map<number, string>,
  signal?: AbortSignal,
): Promise<KiCadPadModel> {
  return new KiCadPadBuilder(index, layers, nets).build(signal);
}
