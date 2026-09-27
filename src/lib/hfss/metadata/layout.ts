import type { DefDatabase, DefObject, DefValue } from "../binary/def";
import { argument, DefTextReader, type DefCall } from "./text";
import { cooperative } from "../../cooperative";
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
    throw new Error(
      `HFSS 对象类型无效${schema === undefined ? "" : `，需要 ${schema}`}`,
    );
  return value;
}
export function defArray(value: DefValue | undefined): DefValue[] {
  if (!Array.isArray(value)) throw new Error("HFSS 对象集合无效");
  return value;
}
export function defInteger(value: DefValue | undefined): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new Error("HFSS 对象引用无效");
  return value;
}
export function defText(value: DefValue | undefined): string {
  if (typeof value !== "string") throw new Error("HFSS 文本字段无效");
  return value;
}
export function defNumber(value: DefValue | undefined): number {
  if (
    !value ||
    typeof value !== "object" ||
    !("number" in value) ||
    !Number.isFinite(value.number)
  )
    throw new Error("HFSS 数值字段无效");
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
      throw new Error(`HFSS 当前需要一个板级 Cell，实际 ${cells.length} 个`);
    const cell = cells[0],
      metadata = new DefTextReader(defText(cell.fields[0])).read();
    const name = metadata.properties.get("dn");
    if (typeof name !== "string" || !name)
      throw new Error("HFSS 板级 Cell 缺少名称");
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
        throw new Error("HFSS 层定义无效");
      if (layers.has(id)) throw new Error(`HFSS 重复层 ID ${id}`);
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
      if (nets.has(id)) throw new Error(`HFSS 重复网络 ID ${id}`);
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
      if (![12, 13, 14, 15].includes(primitive.schema))
        throw new Error(`HFSS 未支持图元类型 ${primitive.schema}`);
      const info = defPrimitiveInfo(primitive);
      if (primitives.has(info.id))
        throw new Error(`HFSS 重复图元 ID ${info.id}`);
      if (!layers.has(info.layer))
        throw new Error(`HFSS 图元 ${info.id} 引用缺失层 ${info.layer}`);
      if (info.net !== -1 && !nets.has(info.net))
        throw new Error(`HFSS 图元 ${info.id} 引用缺失网络 ${info.net}`);
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
      if (!owner) throw new Error(`HFSS 孔洞引用缺失父图元 ${parent}`);
      const info = defPrimitiveInfo(owner);
      if (info.parent !== -1)
        throw new Error(`HFSS 嵌套孔洞尚未验证：${parent}`);
      for (const child of children)
        if (defPrimitiveInfo(child).layer !== info.layer)
          throw new Error(`HFSS 孔洞与父图元 ${parent} 不在同一层`);
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
  const info = defObject(primitive.fields[0], 11),
    base = defObject(info.fields[0], 10);
  return {
    id: defInteger(defObject(base.fields[0], 5).fields[0]),
    net: defInteger(base.fields[1]),
    component: defInteger(base.fields[2]),
    layer: defInteger(info.fields[1]),
    parent: defInteger(info.fields[4]),
  };
}
