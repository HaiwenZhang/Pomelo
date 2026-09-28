import type { DefObject, DefValue } from "../../src/lib/hfss/binary/def";

export const u32 = (n: number) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(n >>> 0);
  return bytes;
};

export const f64 = (n: number) => {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleLE(n);
  return bytes;
};

export const string = (value: string) => {
  const bytes = Buffer.from(value);
  return Buffer.concat([u32(bytes.length), bytes]);
};

const arrayBuffer = (bytes: Buffer): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
};

export function binaryFixture(
  fields: number[],
  payload: Buffer[],
  version = "12.1",
) {
  return arrayBuffer(
    Buffer.concat([
      Buffer.from([0]),
      string(
        `$begin 'Hdr'\n Version='${version}'\n Encrypted=false\n$end 'Hdr'\n`,
      ),
      u32(-1),
      u32(1),
      u32(0),
      u32(fields.length),
      ...fields.flatMap((type, field) => [u32(field), u32(type)]),
      u32(-1),
      u32(1),
      u32(0),
      ...payload,
      u32(-1),
    ]),
  );
}

/** Encode a small, typed EDB tree for end-to-end parser tests. */
export function encodeDefObject(root: DefObject): ArrayBuffer {
  const schemas = new Map<number, number[]>();
  const typeOf = (value: DefValue): number => {
    if (value === null) return 5;
    if (Array.isArray(value)) return 6;
    if (typeof value === "string") return 4;
    if (typeof value === "number") return Number.isSafeInteger(value) ? 1 : 2;
    return "schema" in value ? 5 : 3;
  };
  const visit = (value: DefValue): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === "object" && "schema" in value) {
      const types = value.fields.map(typeOf);
      const previous = schemas.get(value.schema);
      if (previous && previous.join() !== types.join())
        throw new Error(`测试 DEF schema ${value.schema} 不一致`);
      schemas.set(value.schema, types);
      value.fields.forEach(visit);
    }
  };
  visit(root);

  const encode = (type: number, value: DefValue): Buffer => {
    if (type === 1) return u32(value as number);
    if (type === 2) return f64(value as number);
    if (type === 3) {
      const numeric = value as { number: number; expression: string };
      return Buffer.concat([f64(numeric.number), string(numeric.expression)]);
    }
    if (type === 4) return string(value as string);
    if (type === 5) {
      if (value === null) return u32(-1);
      const record = value as DefObject;
      return Buffer.concat([
        u32(record.schema),
        ...record.fields.map((field, index) =>
          encode(schemas.get(record.schema)![index], field),
        ),
      ]);
    }
    if (type === 6) {
      const values = value as DefValue[];
      const element = values.length
        ? values.every((item) => typeof item === "number")
          ? 2
          : typeOf(values[0])
        : 0xffffffff;
      return Buffer.concat([
        u32(values.length),
        u32(element),
        ...values.map((item) => encode(element, item)),
      ]);
    }
    throw new Error(`测试 DEF 值类型无效 ${type}`);
  };

  const definitions = [...schemas].sort(([a], [b]) => a - b);
  return arrayBuffer(
    Buffer.concat([
      Buffer.from([0]),
      string("$begin 'Hdr'\n Version='12.1'\n Encrypted=false\n$end 'Hdr'\n"),
      u32(-1),
      u32(definitions.length),
      ...definitions.flatMap(([id, types]) => [
        u32(id),
        u32(types.length),
        ...types.flatMap((type, field) => [u32(field), u32(type)]),
      ]),
      u32(-1),
      u32(1),
      encode(5, root),
      u32(-1),
    ]),
  );
}
