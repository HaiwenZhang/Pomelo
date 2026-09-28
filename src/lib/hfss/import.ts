import type {
  BoardScene,
  Bounds,
  PadShape,
  Pin,
  Point,
  Segment,
  Via,
} from "../board/model";
import { BOND_TOP_LAYER, BOND_WIRE_TOP_LAYER } from "../board/layers";
import { CopperMesh } from "../board/copper-mesh";
import { PadShape as PadShapeGeometry } from "../board/shapes/pad";
import { PathShape } from "../board/shapes/path";
import { PointShape } from "../board/shapes/point";
import { SegmentShape } from "../board/shapes/segment";
import { cooperative } from "../cooperative";
import { PadShape as BoardPadShape } from "../board/shapes/pad";
import { ShapeTransform } from "../board/shapes/transform";
import { parserError } from "../parser-error";
import { DefReader } from "./binary/def";
import { defPolygonPath, defPrimitivePath } from "./geometry";
import {
  defArray,
  defInteger,
  defNumber,
  defObject,
  defPrimitiveInfo,
  defText,
  DefLayoutReader,
} from "./metadata/layout";
import {
  defDrill,
  defPadInstance,
  defPadShape,
  defQuantity,
  DefPadstackReader,
} from "./metadata/padstack";
import { argument, DefStatementReader } from "./metadata/text";
export interface HfssInfo {
  version: string;
  cell: string;
  bytes: number;
  sourcePrimitives: number;
  voids: number;
  padstacks: number;
}
const colors = [
  "#58b5ed",
  "#83ce94",
  "#edb963",
  "#ba8bec",
  "#eb819d",
  "#54c7bd",
  "#a5b8df",
  "#e18d61",
];
/** HFSS import supplies format-independent board geometry. */
export async function importHfss(
  buffer: ArrayBuffer,
  signal?: AbortSignal,
  progress?: (phase: string) => void,
): Promise<{
  scene: BoardScene;
  info: HfssInfo;
}> {
  const db = await new DefReader(buffer).read(signal, progress);
  progress?.("读取 HFSS 层、网络与 Padstack");
  const source = await new DefLayoutReader(db).read(signal),
    padstacks = new DefPadstackReader(db, source).read(),
    pause = cooperative(signal);
  const copper = [...source.layers.values()].filter((l) => l.type === "signal");
  if (!copper.length) throw parserError("hfssNoCopper");
  const layerIds = new Map(copper.map((l, i) => [l.id, i]));
  const netIds = new Map([...source.nets.keys()].map((id, i) => [id, i + 1]));
  const netId = (id: number) => {
    if (id === -1) return 0;
    const mapped = netIds.get(id);
    if (mapped === undefined)
      throw parserError("hfssMissingNet", { detail: id });
    return mapped;
  };
  const scene: BoardScene = {
    layers: copper.map((l, i) => ({
      id: i,
      name: l.name,
      color: colors[i % colors.length],
      layerFunction: "conductor",
    })),
    nets: new Map([...source.nets].map(([id, name]) => [netId(id), name])),
    segments: [],
    vias: [],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    },
    diagnostics: [],
  };
  const include = (bounds: Bounds) => {
    scene.bounds.minX = Math.min(scene.bounds.minX, bounds.minX);
    scene.bounds.maxX = Math.max(scene.bounds.maxX, bounds.maxX);
    scene.bounds.minY = Math.min(scene.bounds.minY, bounds.minY);
    scene.bounds.maxY = Math.max(scene.bounds.maxY, bounds.maxY);
  };
  const components = new Map<number, string>();
  for (const value of defArray(source.layout.fields[6])) {
    const component = defObject(value, 22),
      group = defObject(component.fields[0], 21),
      base = defObject(group.fields[0], 10);
    const transform = new DefStatementReader(defText(group.fields[2])).read()
      .value;
    if (typeof transform !== "object" || transform.name !== "f")
      throw parserError("hfssInvalidTransform");
    if (
      defQuantity(argument(transform, "x"), "length") !== 0 ||
      defQuantity(argument(transform, "y"), "length") !== 0 ||
      defQuantity(argument(transform, "r"), "angle") !== 0 ||
      Number(argument(transform, "s")) !== 1 ||
      argument(transform, "m") !== false
    )
      throw parserError("hfssUnsupportedTransform");
    components.set(
      defInteger(defObject(base.fields[0], 5).fields[0]),
      defText(group.fields[1]),
    );
  }
  let nextId = 1,
    processed = 0;
  progress?.("构建 HFSS 走线与铜区");
  for (const primitive of source.primitives.values()) {
    if (++processed % 256 === 0) {
      const pending = pause();
      if (pending) await pending;
    }
    const info = defPrimitiveInfo(primitive);
    if (info.parent !== -1) continue;
    const layer = layerIds.get(info.layer),
      net = netId(info.net);
    if (primitive.schema === 16) {
      if (source.layers.get(info.layer)?.type !== "wirebond")
        throw parserError("hfssInvalidBondWireLayer", { detail: info.id });
      const path = defObject(primitive.fields[0], 14),
        width = defNumber(path.fields[4]) * 1000,
        profile = defText(primitive.fields[1]),
        material = defText(primitive.fields[3]);
      if (width <= 0 || source.voids.has(info.id))
        throw parserError("hfssInvalidBondWireGeometry", { detail: info.id });
      if (!scene.specialLayers)
        scene.specialLayers = [
          {
            id: BOND_WIRE_TOP_LAYER,
            name: source.layers.get(info.layer)!.name,
            color: "#e4d95b",
            kind: "bond-wire",
            category: "bond-wire",
          },
        ];
      const trackId = nextId++;
      for (const segment of defPolygonPath(defObject(path.fields[6], 36))) {
        Object.assign(segment, {
          id: nextId++,
          trackId,
          layer: BOND_WIRE_TOP_LAYER,
          net,
          width,
          bondWire: {
            profile,
            material,
            sourcePin: -1,
            finger: -1,
            reference: components.get(info.component) ?? "",
            pinName: "",
          },
        });
        scene.segments.push(segment);
        include(new SegmentShape(segment).bounds());
      }
      continue;
    }
    if (
      source.layers.get(info.layer)?.type === "outline" &&
      primitive.schema === 14
    ) {
      const width = defNumber(primitive.fields[4]) * 1000;
      if (width < 0) throw parserError("hfssInvalidOutlineWidth");
      for (const segment of defPolygonPath(
        defObject(primitive.fields[6], 36),
      )) {
        Object.assign(segment, {
          id: nextId++,
          trackId: 0,
          layer: -1,
          net: 0,
          width,
        });
        segment.trackId = segment.id;
        scene.outline.push(segment);
        include(new SegmentShape(segment).bounds());
      }
      continue;
    }
    if (
      source.layers.get(info.layer)?.type === "outline" &&
      primitive.schema !== 14
    ) {
      const polygons = [primitive, ...(source.voids.get(info.id) ?? [])];
      for (const polygon of polygons)
        for (const segment of defPrimitivePath(polygon)) {
          Object.assign(segment, {
            id: nextId++,
            trackId: 0,
            layer: -1,
            net: 0,
          });
          segment.trackId = segment.id;
          scene.outline.push(segment);
          include(new SegmentShape(segment).bounds());
        }
      continue;
    }
    if (layer === undefined)
      throw parserError("hfssUnsupportedNoncopperLayer", {
        detail: source.layers.get(info.layer)?.name ?? "",
      });
    if (primitive.schema === 14) {
      if ([1, 2, 3].some((i) => defInteger(primitive.fields[i]) !== 0))
        throw parserError("hfssNonroundTraceUnsupported");
      if (source.voids.has(info.id))
        throw parserError("hfssVoidedTraceUnsupported");
      const width = defNumber(primitive.fields[4]) * 1000,
        trackId = nextId++;
      if (width < 0) throw parserError("hfssInvalidTraceWidth");
      for (const segment of defPolygonPath(
        defObject(primitive.fields[6], 36),
      )) {
        Object.assign(segment, { id: nextId++, trackId, layer, net, width });
        scene.segments.push(segment);
        include(new SegmentShape(segment).bounds());
      }
    } else if ([12, 13, 15].includes(primitive.schema)) {
      const paths: Segment[][] = [defPrimitivePath(primitive)];
      for (const hole of source.voids.get(info.id) ?? []) {
        paths.push(defPrimitivePath(hole));
      }
      if (!paths[0].length)
        throw parserError("hfssEmptyCopperArea", { detail: info.id });
      const id = nextId++,
        rings = paths.map((path) => new PathShape(path).flatten());
      for (const path of paths)
        for (const segment of path) {
          Object.assign(segment, { id, trackId: id, layer, net });
          include(new SegmentShape(segment).bounds());
        }
      const mesh = await new CopperMesh(rings).build(signal, paths);
      scene.zones.push({ id, layer, net, paths, rings: [], ...mesh });
    } else
      throw parserError("hfssUnverifiedPrimitiveConversion", {
        detail: primitive.schema,
      });
  }
  progress?.("构建 HFSS 焊盘与钻孔");
  const shapeCache = new Map<number, PadShape[]>();
  for (const value of defArray(source.layout.fields[5])) {
    if (++processed % 256 === 0) {
      const pending = pause();
      if (pending) await pending;
    }
    const pad = defPadInstance(defObject(value, 19), padstacks),
      binding = pad.binding;
    let templates = shapeCache.get(binding.id);
    if (!templates) {
      templates = [];
      if (binding.die) {
        const sourceLayer = binding.definition.layers.get(binding.first)!;
        const shape = defPadShape(sourceLayer.pad, BOND_TOP_LAYER);
        if (shape) templates.push(shape);
      } else {
        for (const copperLayer of copper) {
          if (!binding.usedLayers.has(copperLayer.id)) continue;
          const definitionLayerId = binding.forward[copperLayer.id] ?? -1;
          if (definitionLayerId === -1) continue;
          const definitionLayer =
            binding.definition.layers.get(definitionLayerId)!;
          const shape = defPadShape(
            definitionLayer.pad,
            layerIds.get(copperLayer.id)!,
          );
          if (shape) templates.push(shape);
        }
      }
      shapeCache.set(binding.id, templates);
    }
    if (
      binding.die &&
      !scene.specialLayers?.some((layer) => layer.id === BOND_TOP_LAYER)
    ) {
      scene.specialLayers ??= [];
      scene.specialLayers.push({
        id: BOND_TOP_LAYER,
        name: "BOND TOP",
        color: "#d7cd58",
        kind: "die-pad",
        category: "etch",
      });
    }
    const hole = defDrill(binding.definition.hole),
      drill = hole.height;
    // `flp` is binding metadata, not an additional planar reflection. Native
    // GetGeometries confirms that mirrored definitions already store their
    // final local shape; applying flp again reflects them a second time.
    const holeOffset = new PointShape(hole.offset).rotate(pad.rotation);
    const at: Point = [
      pad.x * 1000 + holeOffset[0],
      pad.y * 1000 + holeOffset[1],
    ];
    const shapes = templates.map((shape) => {
      const offset = new PointShape(shape.offset).rotate(pad.rotation);
      const result = {
        ...shape,
        offset: [offset[0] - holeOffset[0], offset[1] - holeOffset[1]] as Point,
      };
      if (hole.angle !== 0 && shape.type !== 2) {
        const paths = new BoardPadShape(shape)
          .paths()
          .map((path) =>
            path.map((s) =>
              new ShapeTransform([0, 0], -hole.angle, false).segment(s),
            ),
          );
        result.customPaths = paths;
        result.custom = paths.map((path) => new PathShape(path).flatten());
      }
      return result;
    });
    const reference = pad.component === -1 ? "" : components.get(pad.component);
    if (reference === undefined)
      throw parserError("hfssPadMissingComponent", { detail: pad.component });
    const id = nextId++,
      net = netId(pad.net);
    let owner: Pin | Via;
    const angle = pad.rotation + hole.angle;
    if (pad.pin || binding.die) {
      owner = {
        id,
        net,
        name: pad.name,
        reference,
        at,
        angle,
        back: false,
        drill,
        shapes,
      };
      if (binding.die)
        owner.die = {
          sourceReference: binding.id,
          padstackName: binding.definition.name,
        };
      scene.pins.push(owner);
    } else {
      const first = layerIds.get(binding.first),
        last = layerIds.get(binding.last);
      if (first === undefined || last === undefined)
        throw parserError("hfssDrillEndsNotConductors");
      owner = {
        id,
        net,
        at,
        angle,
        back: false,
        drill,
        padstack: binding.definition.id,
        padstackName: binding.definition.name,
        startLayer: Math.min(first, last),
        endLayer: Math.max(first, last),
        pads: shapes,
      };
      scene.vias.push(owner);
    }
    if (drill > 0)
      owner.drillShape = {
        width: hole.width,
        height: hole.height,
        plated: Number(binding.definition.source.properties.get("plt")) > 0,
      };
    for (const shape of shapes)
      include(new PadShapeGeometry(shape).bounds(owner));
    if (drill > 0)
      include(
        new PadShapeGeometry({
          layer: -1,
          type: 11,
          width: hole.width,
          height: hole.height,
          offset: [0, 0],
        }).bounds(owner),
      );
  }
  if (!Number.isFinite(scene.bounds.minX)) throw parserError("hfssNoGeometry");
  signal?.throwIfAborted();
  return {
    scene,
    info: {
      version: db.version,
      cell: source.name,
      bytes: db.bytes,
      sourcePrimitives: source.primitives.size,
      voids: [...source.voids.values()].reduce(
        (sum, values) => sum + values.length,
        0,
      ),
      padstacks: scene.pins.length + scene.vias.length,
    },
  };
}
