import type { DefDatabase, DefObject, DefValue } from "../binary/def";
import { argument, DefTextReader, type DefCall } from "./text";
import { cooperative } from "../../cooperative";
import { parserError } from "../../parser-error";
export function defObject(
  value: DefValue | undefined,
  schema?: number,
): DefObject {
  if (
    !value ||
    typeof value !== "object" ||
    !("schema" in value) ||
    (schema !== undefined && value.schema !== schema)
  )
    throw schema === undefined
      ? parserError("hfssInvalidObjectTypeWithoutSchema")
      : parserError("hfssInvalidObjectSchema", { detail: schema });
  return value;
}
export function defArray(value: DefValue | undefined): DefValue[] {
  if (!Array.isArray(value)) throw parserError("hfssInvalidObjectCollection");
  return value;
}
export function defInteger(value: DefValue | undefined): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw parserError("hfssInvalidObjectReference");
  return value;
}
export function defText(value: DefValue | undefined): string {
  if (typeof value !== "string") throw parserError("hfssInvalidTextField");
  return value;
}
export function defNumber(value: DefValue | undefined): number {
  if (
    !value ||
    typeof value !== "object" ||
    !("number" in value) ||
    !Number.isFinite(value.number)
  )
    throw parserError("hfssInvalidNumericField");
  return value.number;
}
export interface DefLayer {
  id: number;
  name: string;
  type: string;
  stackup: boolean;
  source: DefCall;
}
export interface DefLayout {
  name: string;
  cell: DefObject;
  layout: DefObject;
  layers: Map<number, DefLayer>;
  nets: Map<number, string>;
  primitives: Map<number, DefObject>;
  voids: Map<number, DefObject[]>;
}
/** Resolve source namespaces before allocating renderer IDs. Cell selection
 * depends only on the DEF, never its filename or a matching BRD/native report. */
export class DefLayoutReader {
  constructor(private readonly db: DefDatabase) {}
  async read(signal?: AbortSignal): Promise<DefLayout> {
    const { db } = this;
    signal?.throwIfAborted();
    const pause = cooperative(signal);
    const cells = defArray(defObject(db.root.fields[2], 1).fields[0])
      .flatMap((group) => defArray(defObject(group, 2).fields[1]))
      .map((c) => defObject(c, 3));
    if (cells.length !== 1)
      throw parserError("hfssCellCount", { detail: cells.length });
    const cell = cells[0],
      metadata = new DefTextReader(defText(cell.fields[0])).read();
    const name = metadata.properties.get("dn");
    if (typeof name !== "string" || !name)
      throw parserError("hfssUnnamedBoardCell");
    const layout = defObject(cell.fields[4], 4),
      layers = new Map<number, DefLayer>();
    for (const source of new DefTextReader(defText(cell.fields[2])).read()
      .calls) {
      const nested = source.name === "SLayer" ? source.args[0]?.value : source;
      if (!nested || typeof nested !== "object" || nested.name !== "Layer")
        continue;
      const id = argument(nested, "ID"),
        layerName = argument(nested, "N"),
        type = argument(nested, "T");
      if (
        typeof id !== "number" ||
        !Number.isSafeInteger(id) ||
        typeof layerName !== "string" ||
        typeof type !== "string"
      )
        throw parserError("hfssInvalidLayerDefinition");
      if (layers.has(id))
        throw parserError("hfssDuplicateLayer", { detail: id });
      layers.set(id, {
        id,
        name: layerName,
        type,
        stackup: source.name === "SLayer",
        source,
      });
    }
    const nets = new Map<number, string>();
    for (const value of defArray(layout.fields[1])) {
      const net = defObject(value, 7),
        id = defInteger(defObject(net.fields[0], 5).fields[0]);
      if (nets.has(id)) throw parserError("hfssDuplicateNet", { detail: id });
      nets.set(id, defText(net.fields[1]));
    }
    const primitives = new Map<number, DefObject>(),
      voids = new Map<number, DefObject[]>();
    let count = 0;
    for (const value of defArray(layout.fields[4])) {
      if (++count % 512 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const primitive = defObject(value);
      if (![12, 13, 14, 15, 16].includes(primitive.schema))
        throw parserError("hfssUnsupportedPrimitive", {
          detail: primitive.schema,
        });
      const info = defPrimitiveInfo(primitive);
      if (primitives.has(info.id))
        throw parserError("hfssDuplicatePrimitive", { detail: info.id });
      if (!layers.has(info.layer))
        throw parserError("hfssMissingPrimitiveLayer", {
          detail: info.id,
          value: info.layer,
        });
      if (info.net !== -1 && !nets.has(info.net))
        throw parserError("hfssMissingPrimitiveNet", {
          detail: info.id,
          value: info.net,
        });
      primitives.set(info.id, primitive);
      if (info.parent !== -1) {
        const children = voids.get(info.parent);
        if (children) children.push(primitive);
        else voids.set(info.parent, [primitive]);
      }
    }
    for (const [parent, children] of voids) {
      if (++count % 512 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const owner = primitives.get(parent);
      if (!owner)
        throw parserError("hfssMissingParentPrimitive", { detail: parent });
      const info = defPrimitiveInfo(owner);
      if (info.parent !== -1)
        throw parserError("hfssNestedVoidUnverified", { detail: parent });
      for (const child of children)
        if (defPrimitiveInfo(child).layer !== info.layer)
          throw parserError("hfssVoidLayerMismatch", { detail: parent });
    }
    signal?.throwIfAborted();
    return { name, cell, layout, layers, nets, primitives, voids };
  }
}
/** Compatibility entry point; parsing state belongs to DefLayoutReader. */
export async function readDefLayout(
  db: DefDatabase,
  signal?: AbortSignal,
): Promise<DefLayout> {
  return new DefLayoutReader(db).read(signal);
}
export function defPrimitiveInfo(primitive: DefObject) {
  const geometry =
      primitive.schema === 16 ? defObject(primitive.fields[0], 14) : primitive,
    info = defObject(geometry.fields[0], 11),
    base = defObject(info.fields[0], 10);
  return {
    id: defInteger(defObject(base.fields[0], 5).fields[0]),
    net: defInteger(base.fields[1]),
    component: defInteger(base.fields[2]),
    layer: defInteger(info.fields[1]),
    parent: defInteger(info.fields[4]),
  };
}
