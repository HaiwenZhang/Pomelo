import { cooperative } from "../../cooperative";
import { hfssDefError, parserError } from "../../parser-error";
export interface DefNumber {
  number: number;
  expression: string;
}
export interface DefObject {
  schema: number;
  offset: number;
  end: number;
  fields: DefValue[];
}
export type DefValue =
  number | string | null | DefNumber | DefObject | DefValue[];
export interface DefSchema {
  id: number;
  fields: {
    id: number;
    type: number;
  }[];
}
export interface DefDatabase {
  version: string;
  header: string;
  root: DefObject;
  schemas: Map<number, DefSchema>;
  counts: Map<number, number>;
  values: number;
  bytes: number;
}
const decoder = new TextDecoder("utf-8", { fatal: true });
/** EDB 12.1 typed archive. This reads the supplied DEF, never the matching BRD.
 * Field types are declared in its schema table. Geometry semantics live in the
 * separate adapter; unknown value encodings fail at their actual byte offset. */
export class DefReader {
  constructor(private readonly buffer: ArrayBuffer) {}
  async read(
    signal?: AbortSignal,
    progress?: (phase: string) => void,
  ): Promise<DefDatabase> {
    // Let the caller register cancellation before the first parsing time slice.
    await Promise.resolve();
    return new DefReadSession(this.buffer).read(signal, progress);
  }
}
/** Mutable cursor and schema tables are scoped to one read, including cancellation. */
class DefReadSession {
  private readonly data: DataView;
  private readonly bytes: Uint8Array;
  private readonly schemas = new Map<number, DefSchema>();
  private readonly counts = new Map<number, number>();
  private offset = 0;
  private values = 0;
  constructor(buffer: ArrayBuffer) {
    this.data = new DataView(buffer);
    this.bytes = new Uint8Array(buffer);
  }
  private fail(reason: string, id?: string | number): never {
    throw hfssDefError(reason, this.offset, id);
  }
  private need(size: number) {
    if (size < 0 || this.offset + size > this.data.byteLength)
      this.fail("truncated");
  }
  private u8() {
    this.need(1);
    return this.data.getUint8(this.offset++);
  }
  private u32() {
    this.need(4);
    const n = this.data.getUint32(this.offset, true);
    this.offset += 4;
    return n;
  }
  private i32() {
    this.need(4);
    const n = this.data.getInt32(this.offset, true);
    this.offset += 4;
    return n;
  }
  private f64() {
    this.need(8);
    const n = this.data.getFloat64(this.offset, true);
    this.offset += 8;
    return n;
  }
  private string() {
    const size = this.u32();
    this.need(size);
    let result: string;
    try {
      result = decoder.decode(
        this.bytes.subarray(this.offset, this.offset + size),
      );
    } catch {
      return this.fail("invalidUtf8");
    }
    this.offset += size;
    return result;
  }
  private *value(type: number, depth = 0): Generator<void, DefValue> {
    if (depth > 100) this.fail("tooDeep");
    if ((++this.values & 2047) === 0) yield;
    switch (type) {
      case 0:
        return this.u8();
      case 1:
        return this.i32();
      case 2:
        return this.f64();
      case 3:
        return { number: this.f64(), expression: this.string() };
      case 4:
        return this.string();
      case 5: {
        const start = this.offset,
          id = this.i32();
        if (id === -1) return null;
        const schema = this.schemas.get(id);
        if (!schema) return this.fail("undefinedRecord", id);
        const fields: DefValue[] = [];
        this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
        for (const field of schema.fields) {
          if (field.type <= 4) {
            if (depth >= 100) this.fail("tooDeep");
            if ((++this.values & 2047) === 0) yield;
            fields[field.id] = this.scalar(field.type);
          } else fields[field.id] = yield* this.value(field.type, depth + 1);
        }
        return { schema: id, offset: start, end: this.offset, fields };
      }
      case 6: {
        const count = this.u32(),
          element = this.u32();
        // Empty untyped collections use 0xffffffff in native generated files.
        if (
          count > 10000000 ||
          count > this.data.byteLength - this.offset ||
          (count && element > 8)
        )
          this.fail("invalidArray");
        const result: DefValue[] = new Array(count);
        if (element <= 4) {
          // Numeric polygon vectors dominate DEF input. Read scalars directly
          // while retaining the same value count and cancellation checkpoints.
          if (count && depth >= 100) this.fail("tooDeep");
          for (let i = 0; i < count; i++) {
            if ((++this.values & 2047) === 0) yield;
            result[i] = this.scalar(element);
          }
        } else {
          for (let i = 0; i < count; i++)
            result[i] = yield* this.value(element, depth + 1);
        }
        return result;
      }
      case 7: {
        const count = this.u32();
        if (
          count > 10000000 ||
          count > (this.data.byteLength - this.offset) / 5
        )
          this.fail("invalidProperties");
        const result: DefValue[] = new Array(count);
        for (let i = 0; i < count; i++) {
          const element = this.u32();
          if (element <= 4) {
            if (depth >= 100) this.fail("tooDeep");
            if ((++this.values & 2047) === 0) yield;
            result[i] = this.scalar(element);
          } else result[i] = yield* this.value(element, depth + 1);
        }
        return result;
      }
      default:
        return this.fail("unverifiedValueType", type);
    }
  }
  private scalar(type: number): DefValue {
    switch (type) {
      case 0:
        return this.u8();
      case 1:
        return this.i32();
      case 2:
        return this.f64();
      case 3:
        return { number: this.f64(), expression: this.string() };
      case 4:
        return this.string();
      default:
        return this.fail("unverifiedValueType", type);
    }
  }
  async read(
    signal?: AbortSignal,
    progress?: (phase: string) => void,
  ): Promise<DefDatabase> {
    signal?.throwIfAborted();
    if (this.data.byteLength > 512 * 1024 * 1024)
      throw parserError("hfssDefTooLarge");
    const pause = cooperative(signal);
    if (this.u8() !== 0) this.fail("invalidHeader");
    const header = this.string(),
      version = /(?:^|\n)\s*Version='([^']+)'/.exec(header)?.[1];
    if (!header.startsWith("$begin 'Hdr'") || version !== "12.1")
      this.fail("unverifiedVersion", version ?? "?");
    if (!/(?:^|\n)\s*Encrypted=false(?:\r?\n|$)/.test(header))
      this.fail("encrypted");
    progress?.("读取 HFSS DEF 字段表");
    if (this.i32() !== -1) this.fail("invalidSchemaStart");
    const schemaCount = this.u32();
    if (schemaCount > 4096) this.fail("tooManySchemas");
    for (let i = 0; i < schemaCount; i++) {
      const id = this.u32(),
        length = this.u32(),
        fields: DefSchema["fields"] = [],
        seen = new Set<number>();
      if (this.schemas.has(id) || length > 256) this.fail("duplicateSchema");
      for (let j = 0; j < length; j++) {
        const field = this.u32(),
          type = this.u32();
        if (seen.has(field) || field > 255 || type > 8)
          this.fail("invalidField");
        fields.push({ id: field, type });
        seen.add(field);
      }
      this.schemas.set(id, { id, fields });
    }
    if (this.i32() !== -1 || this.u32() !== 1) this.fail("invalidRootMarker");
    progress?.("读取 HFSS DEF 数据记录");
    const iterator = this.value(5);
    let step = iterator.next(),
      checkpoints = 0,
      yielded = false;
    while (!step.done) {
      const pending = pause();
      if (pending) {
        await pending;
        yielded = true;
      }
      // Fast scalar vectors also yield by work quota so a queued cancellation is
      // observed even when the remainder fits in the next wall-clock budget.
      else if (!yielded && ++checkpoints === 32) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        yielded = true;
      }
      signal?.throwIfAborted();
      step = iterator.next();
    }
    const root = step.value;
    if (
      !root ||
      typeof root !== "object" ||
      !("schema" in root) ||
      root.schema !== 0
    )
      this.fail("invalidRoot");
    if (this.i32() !== -1 || this.offset !== this.data.byteLength)
      this.fail("invalidEnd");
    signal?.throwIfAborted();
    return {
      version: version!,
      header,
      root: root as DefObject,
      schemas: this.schemas,
      counts: this.counts,
      values: this.values,
      bytes: this.data.byteLength,
    };
  }
}
/** Compatibility entry point; parsing state belongs to DefReader. */
export async function readDef(
  buffer: ArrayBuffer,
  signal?: AbortSignal,
  progress?: (phase: string) => void,
): Promise<DefDatabase> {
  return new DefReader(buffer).read(signal, progress);
}
