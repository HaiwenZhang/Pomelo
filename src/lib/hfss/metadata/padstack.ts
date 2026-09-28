import type { PadShape } from "../../board/model";
import { PathShape } from "../../board/shapes/path";
import { SegmentShape } from "../../board/shapes/segment";
import type { DefDatabase, DefObject } from "../binary/def";
import {
  defArray,
  defInteger,
  defNumber,
  defObject,
  defText,
  type DefLayout,
} from "./layout";
import {
  argument,
  child,
  DefTextReader,
  type DefBlock,
  type DefCall,
  type DefTextValue,
} from "./text";
import { PadShape as BoardPadShape } from "../../board/shapes/pad";
import { ShapeTransform } from "../../board/shapes/transform";
import { defPolygonPath } from "../geometry";
import { parserError } from "../../parser-error";
/** Explicit physical quantities only. EDB expressions need a separate resolver;
 * do not silently parse their leading numeric prefix or execute source text. */
export function defQuantity(
  value: DefTextValue | undefined,
  dimension: "length" | "angle",
): number {
  if (typeof value !== "string" && typeof value !== "number")
    throw parserError("hfssInvalidPhysicalQuantity");
  const match =
    /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*([a-zµμ]*)\s*$/i.exec(
      String(value),
    );
  if (!match)
    throw parserError("hfssUnparsedParameter", { detail: String(value) });
  const units: Record<string, number> =
    dimension === "length"
      ? {
          "": 1,
          m: 1,
          cm: 0.01,
          mm: 0.001,
          um: 1e-6,
          µm: 1e-6,
          μm: 1e-6,
          nm: 1e-9,
          mil: 0.0000254,
          in: 0.0254,
          inch: 0.0254,
        }
      : { "": 1, rad: 1, deg: Math.PI / 180 };
  const scale = units[match[2].toLowerCase()],
    result = Number(match[1]) * scale;
  if (scale === undefined || !Number.isFinite(result))
    throw parserError("hfssInvalidPhysicalUnit", {
      detail: dimension,
      value: String(value),
    });
  return result;
}
export interface DefPadLayer {
  id: number;
  name: string;
  pad: DefCall;
  source: DefBlock;
}
export interface DefPadstack {
  id: number;
  name: string;
  layers: Map<number, DefPadLayer>;
  hole: DefCall;
  source: DefBlock;
}
export interface DefPadBinding {
  id: number;
  definition: DefPadstack;
  first: number;
  last: number;
  flipped: boolean;
  forward: number[];
  usedLayers: Set<number>;
  die: boolean;
  source: DefBlock;
}
export interface DefPadstacks {
  definitions: Map<number, DefPadstack>;
  bindings: Map<number, DefPadBinding>;
}
const integer = (v: DefTextValue | undefined) => {
  if (typeof v !== "number" || !Number.isSafeInteger(v))
    throw parserError("hfssInvalidPadstackReference");
  return v;
};
const text = (v: DefTextValue | undefined) => {
  if (typeof v !== "string") throw parserError("hfssInvalidPadstackName");
  return v;
};
function requiredCall(block: DefBlock, name: string) {
  const calls = block.calls.filter((c) => c.name === name);
  if (calls.length !== 1)
    throw parserError("hfssMissingOrDuplicatePadstackCall", { detail: name });
  return calls[0];
}
/** The observed flags are 0..3. Bit 0 enables the regular pad; bit 1 is
 * retained in source metadata, not treated as a second regular pad. */
export function defUsedPadLayers(usage: string): Set<number> {
  if (usage && !/^(?:\d+:[0-3]:)+$/.test(usage))
    throw parserError("hfssUnknownPadstackUsage", { detail: usage });
  const entries = usage.split(":"),
    seen = new Set<number>(),
    used = new Set<number>();
  for (let i = 0; i + 1 < entries.length; i += 2) {
    const layer = Number(entries[i]);
    if (!Number.isSafeInteger(layer) || seen.has(layer))
      throw parserError("hfssInvalidPadstackUsageLayer", { detail: layer });
    seen.add(layer);
    if (Number(entries[i + 1]) & 1) used.add(layer);
  }
  return used;
}
export class DefPadstackReader {
  constructor(
    private readonly db: DefDatabase,
    private readonly layout: DefLayout,
  ) {}
  read(): DefPadstacks {
    const { db, layout } = this;
    const metadata = new DefTextReader(defText(db.root.fields[0])).read(),
      definitions = new Map<number, DefPadstack>();
    for (const record of child(metadata, "pds")?.children ?? []) {
      if (record.name !== "pd")
        throw parserError("hfssUnknownPadstackDefinition", {
          detail: record.name,
        });
      const id = integer(record.properties.get("id")),
        source = child(record, "psd");
      if (!source || definitions.has(id))
        throw parserError("hfssInvalidPadstackDefinition", { detail: id });
      const layers = new Map<number, DefPadLayer>();
      for (const layer of child(source, "pds")?.children ?? []) {
        if (layer.name !== "lgm")
          throw parserError("hfssUnknownPadstackLayer", { detail: layer.name });
        const layerId = integer(layer.properties.get("id"));
        if (layers.has(layerId))
          throw parserError("hfssDuplicatePadstackLayer", { detail: layerId });
        layers.set(layerId, {
          id: layerId,
          name: text(layer.properties.get("lay")),
          pad: requiredCall(layer, "pad"),
          source: layer,
        });
      }
      definitions.set(id, {
        id,
        name: text(source.properties.get("nam")),
        layers,
        hole: requiredCall(source, "hle"),
        source,
      });
    }
    const bindings = new Map<number, DefPadBinding>();
    for (const value of defArray(layout.cell.fields[3])) {
      const record = defObject(value, 6),
        id = defInteger(record.fields[0]),
        source = new DefTextReader(defText(record.fields[1])).read();
      const definition = definitions.get(integer(source.properties.get("def")));
      if (!definition || bindings.has(id))
        throw parserError("hfssInvalidPadstackBinding", { detail: id });
      const first = integer(source.properties.get("fl")),
        last = integer(source.properties.get("tl"));
      const flipped = source.properties.get("flp");
      if (typeof flipped !== "boolean")
        throw parserError("hfssInvalidPadstackFlipFlag", { detail: id });
      const mapping = child(source, "lm");
      if (!mapping)
        throw parserError("hfssMissingPadstackLayerMapping", { detail: id });
      const forward = requiredCall(mapping, "forward").args.map((arg) =>
        integer(arg.value),
      );
      for (const layerId of forward)
        if (layerId !== -1 && !definition.layers.has(layerId))
          throw parserError("hfssMissingPadstackDefinitionLayer", {
            detail: layerId,
          });
      const usedLayers = defUsedPadLayers(text(source.properties.get("pum")));
      const dieBinding =
        last === 0 &&
        source.properties.get("sbl") === -100 &&
        definition.layers.size === 1 &&
        definition.layers.has(first) &&
        !forward.length &&
        !usedLayers.size;
      if (
        !layout.layers.has(first) ||
        (!layout.layers.has(last) && !dieBinding)
      )
        throw parserError("hfssMissingPadstackSpan", { detail: id });
      for (const layer of usedLayers)
        if (!layout.layers.has(layer))
          throw parserError("hfssMissingPadstackUsageLayer", { detail: layer });
      bindings.set(id, {
        id,
        definition,
        first,
        last,
        flipped,
        forward,
        usedLayers,
        die: dieBinding,
        source,
      });
    }
    return { definitions, bindings };
  }
}
/** Compatibility entry point; parsing state belongs to DefPadstackReader. */
export function readDefPadstacks(
  db: DefDatabase,
  layout: DefLayout,
): DefPadstacks {
  return new DefPadstackReader(db, layout).read();
}
export function defPadInstance(record: DefObject, padstacks: DefPadstacks) {
  if (record.schema !== 19) throw parserError("hfssInvalidPadstackInstance");
  if (defInteger(record.fields[9]) !== 0)
    throw parserError("hfssDrillOverrideUnsupported");
  if (
    defText(record.fields[8]) !== "" ||
    defArray(record.fields[11]).length ||
    defText(record.fields[12]) !== ""
  )
    throw parserError("hfssPadstackExtensionsUnsupported");
  const pin = defInteger(record.fields[10]);
  if (pin !== 0 && pin !== 1) throw parserError("hfssInvalidLayoutPinFlag");
  const base = defObject(record.fields[0], 10),
    binding = padstacks.bindings.get(defInteger(record.fields[1]));
  if (!binding) throw parserError("hfssMissingPadstackBinding");
  return {
    id: defInteger(defObject(base.fields[0], 5).fields[0]),
    net: defInteger(base.fields[1]),
    component: defInteger(base.fields[2]),
    binding,
    x: defNumber(record.fields[2]),
    y: defNumber(record.fields[3]),
    rotation: defNumber(record.fields[4]),
    name: defText(record.fields[6]),
    pin: pin === 1,
  };
}
export function defStandardShape(call: DefCall) {
  const shape = text(argument(call, "shp"));
  if (!["No", "Cir", "Sq", "Rct", "Ov"].includes(shape))
    throw parserError("hfssNonstandardPadShape", { detail: shape });
  const sizes = call.args.find(
    (arg) => typeof arg.value === "object" && arg.value.name === "Szs",
  )?.value;
  if (!sizes || typeof sizes !== "object")
    throw parserError("hfssMissingPadDimensions");
  const parameters = sizes.args.map((a) => defQuantity(a.value, "length"));
  const count = (
    { No: 0, Cir: 1, Sq: 1, Rct: 2, Ov: 3 } as Record<string, number>
  )[shape];
  if (parameters.length !== count || parameters.some((n) => n < 0))
    throw parserError("hfssInvalidPadShapeDimensions", { detail: shape });
  return {
    shape,
    sizes: parameters,
    x: defQuantity(argument(call, "X"), "length"),
    y: defQuantity(argument(call, "Y"), "length"),
    rotation: defQuantity(argument(call, "R"), "angle"),
  };
}
/** Standard local pad geometry in the existing scene's millimetre contract.
 * Keep arbitrary per-layer rotations as analytic paths, since PadShape has no
 * independent rotation field. The owner transform is applied later. */
export function defStandardPad(call: DefCall, layer: number): PadShape | null {
  const value = defStandardShape(call),
    [width = 0, second = width, radius = 0] = value.sizes.map((n) => n * 1000);
  if (value.shape === "No" || width === 0 || second === 0) return null;
  const type =
    value.shape === "Cir" ? 2 : value.shape === "Ov" && radius > 0 ? 27 : 5;
  if (radius > Math.min(width, second) / 2 + 1e-12)
    throw parserError("hfssOvalCornerTooLarge");
  const pad: PadShape = {
    layer,
    type,
    width,
    height: second,
    offset: [value.x * 1000, value.y * 1000],
  };
  if (type === 27) pad.corner = radius;
  if (value.rotation !== 0 && type !== 2) {
    const paths = new BoardPadShape({ ...pad, offset: [0, 0] })
      .paths()
      .map((path) =>
        path.map((segment) =>
          new ShapeTransform([0, 0], value.rotation, false).segment(segment),
        ),
      );
    pad.customPaths = paths;
    pad.custom = paths.map((path) => new PathShape(path).flatten());
  }
  return pad;
}
/** Embedded polygon coordinates use an explicit unit and 1e200 arc sentinel;
 * the native PolygonData representation uses DBL_MAX instead. */
function defTextContour(polygon: DefCall): DefObject {
  const points = polygon.args.find(
    (a) => typeof a.value === "object" && a.value.name === "pt",
  )?.value;
  if (!points || typeof points !== "object")
    throw parserError("hfssPolygonMissingPt");
  const unit = text(argument(points, "U")),
    scale = defQuantity(`1${unit}`, "length");
  const coordinates = points.args.filter((a) => a.key !== "U"),
    values: number[] = [];
  if (coordinates.length % 2)
    throw parserError("hfssInvalidTextPolygonCoordinateCount");
  for (let i = 0; i < coordinates.length; i += 2) {
    const x = coordinates[i],
      y = coordinates[i + 1];
    if (
      x.key !== "x" ||
      y.key !== "y" ||
      typeof x.value !== "number" ||
      typeof y.value !== "number"
    )
      throw parserError("hfssInvalidTextPolygonOrder");
    values.push(
      x.value * scale,
      y.value === 1e200 ? Number.MAX_VALUE : y.value * scale,
    );
  }
  const closed = argument(polygon, "cl");
  if (typeof closed !== "boolean")
    throw parserError("hfssTextPolygonNotClosed");
  // Native EDB omits a repeated closing vertex from PolygonData.Points.
  if (
    closed &&
    values.length >= 4 &&
    values.at(-2) === values[0] &&
    values.at(-1) === values[1]
  )
    values.length -= 2;
  return { schema: 36, offset: 0, end: 0, fields: [closed ? 1 : 0, 0, values] };
}
export function defTextPolygon(call: DefCall): DefObject {
  const polygon = call.args.find(
    (a) => typeof a.value === "object" && a.value.name === "ply",
  )?.value;
  if (!polygon || typeof polygon !== "object")
    throw parserError("hfssPolygonMissingPly");
  return defTextContour(polygon);
}
export function defPadShape(call: DefCall, layer: number): PadShape | null {
  if (argument(call, "shp") !== "Ply") return defStandardPad(call, layer);
  const polygon = defTextPolygon(call);
  if (polygon.fields[0] !== 1) throw parserError("hfssPadPolygonNotClosed");
  const angle = defQuantity(argument(call, "R"), "angle");
  const source = call.args.find(
    (a) => typeof a.value === "object" && a.value.name === "ply",
  )?.value as DefCall;
  const holes = source.args.find(
    (a) => typeof a.value === "object" && a.value.name === "hls",
  )?.value as DefCall | undefined;
  const contours = [polygon];
  for (const arg of holes?.args ?? []) {
    if (typeof arg.value !== "object" || arg.value.name !== "hl")
      throw parserError("hfssInvalidPolygonHole");
    contours.push(defTextContour(arg.value));
  }
  const paths = contours.map((contour) =>
    defPolygonPath(contour).map((s) =>
      new ShapeTransform([0, 0], angle, false).segment(s),
    ),
  );
  const path = paths[0];
  if (!path.length) return null;
  const bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const segment of path) {
    const b = new SegmentShape(segment).bounds();
    bounds.minX = Math.min(bounds.minX, b.minX);
    bounds.maxX = Math.max(bounds.maxX, b.maxX);
    bounds.minY = Math.min(bounds.minY, b.minY);
    bounds.maxY = Math.max(bounds.maxY, b.maxY);
  }
  return {
    layer,
    type: 22,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    offset: [
      defQuantity(argument(call, "X"), "length") * 1000,
      defQuantity(argument(call, "Y"), "length") * 1000,
    ],
    customPaths: paths,
    custom: paths.map((contour) => new PathShape(contour).flatten()),
  };
}
/** Preserve a true circular/capsule drill in the renderer's existing contract.
 * General polygon holes must not be replaced by their bounding rectangle. */
export function defDrill(call: DefCall) {
  if (argument(call, "shp") !== "Ply") {
    const shape = defStandardShape(call);
    if (shape.shape === "Ov") {
      const [width, height, radius] = shape.sizes.map((size) => size * 1000);
      if (
        width <= 0 ||
        height <= 0 ||
        Math.abs(radius - Math.min(width, height) / 2) > 1e-9
      )
        throw parserError("hfssInvalidOvalSlotRadius");
      return {
        width,
        height,
        angle: shape.rotation,
        offset: [shape.x * 1000, shape.y * 1000] as [number, number],
      };
    }
    if (!["No", "Cir"].includes(shape.shape))
      throw parserError("hfssUnsupportedDrillShape", { detail: shape.shape });
    const diameter = (shape.sizes[0] ?? 0) * 1000;
    return {
      width: diameter,
      height: diameter,
      angle: 0,
      offset: [shape.x * 1000, shape.y * 1000] as [number, number],
    };
  }
  const shape = defPadShape(call, -1),
    path = shape?.customPaths?.[0];
  const arcs = path?.filter((s) => s.arc) ?? [],
    lines = path?.filter((s) => !s.arc) ?? [];
  if (!shape || path?.length !== 4 || arcs.length !== 2 || lines.length !== 2)
    throw parserError("hfssUnverifiedPolygonSlot");
  const a = arcs[0].arc!,
    b = arcs[1].arc!,
    dx = b.center[0] - a.center[0],
    dy = b.center[1] - a.center[1],
    length = Math.hypot(dx, dy);
  const tolerance = 1e-8;
  if (
    !length ||
    Math.abs(a.radius - b.radius) > tolerance ||
    [a, b].some((arc) => Math.abs(Math.abs(arc.sweep) - Math.PI) > tolerance) ||
    lines.some(
      (s) =>
        Math.abs(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) - length) >
        tolerance,
    ) ||
    arcs.some(
      (s) =>
        Math.abs(
          ((s.a[0] - s.arc!.center[0]) * dx +
            (s.a[1] - s.arc!.center[1]) * dy) /
            length,
        ) > tolerance,
    )
  )
    throw parserError("hfssInvalidPolygonSlotGeometry");
  return {
    width: length + 2 * a.radius,
    height: 2 * a.radius,
    angle: Math.atan2(dy, dx),
    offset: [
      (a.center[0] + b.center[0]) / 2 + shape.offset[0],
      (a.center[1] + b.center[1]) / 2 + shape.offset[1],
    ] as [number, number],
  };
}
