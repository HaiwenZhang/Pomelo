export interface AltiumBinaryRecord {
  index: number;
  start: number;
  end: number;
  parts: Uint8Array[];
}
export interface AltiumSingleRecord {
  index: number;
  start: number;
  end: number;
  offset: number;
  length: number;
  view: DataView;
}
/** Altium primitive streams store a one-byte record type followed by one or
 * more independently length-prefixed subrecords. The Header stream is the
 * authoritative record count; no suffix is silently ignored. */
export class AltiumBinaryReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly expectedType: number,
    private readonly partCount: number,
    private readonly expectedCount: number,
  ) {}
  /** Fixed primitive streams have one payload. Expose offsets into one shared
   * view, avoiding a subarray, parts array and DataView for every primitive. */
  *singleRecords(): Generator<AltiumSingleRecord> {
    const { data, expectedType, expectedCount, partCount } = this;
    if (
      !Number.isSafeInteger(expectedCount) ||
      expectedCount < 0 ||
      partCount !== 1
    )
      throw new Error("Altium 二进制记录声明无效");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let at = 0;
    for (let index = 0; index < expectedCount; index++) {
      const start = at;
      if (at >= data.length)
        throw new Error(`Altium 记录流提前结束：${index}/${expectedCount}`);
      const type = data[at++];
      if (type !== expectedType)
        throw new Error(
          `Altium 记录类型无效 @${start}: ${type} ≠ ${expectedType}`,
        );
      if (at + 4 > data.length) throw new Error(`Altium 子记录长度截断 @${at}`);
      const length = view.getUint32(at, true);
      at += 4;
      if (length > data.length - at)
        throw new Error(`Altium 子记录越界 @${at}: ${length}`);
      const offset = at;
      at += length;
      yield { index, start, end: at, offset, length, view };
    }
    if (at !== data.length)
      throw new Error(`Altium 记录流剩余 ${data.length - at} 字节`);
  }
  *records(): Generator<AltiumBinaryRecord> {
    const { data, expectedType, partCount, expectedCount } = this;
    if (
      !Number.isSafeInteger(expectedCount) ||
      expectedCount < 0 ||
      !Number.isSafeInteger(partCount) ||
      partCount < 1
    )
      throw new Error("Altium 二进制记录声明无效");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let at = 0;
    for (let index = 0; index < expectedCount; index++) {
      const start = at;
      if (at >= data.length)
        throw new Error(`Altium 记录流提前结束：${index}/${expectedCount}`);
      const type = data[at++];
      if (type !== expectedType)
        throw new Error(
          `Altium 记录类型无效 @${start}: ${type} ≠ ${expectedType}`,
        );
      const parts: Uint8Array[] = [];
      for (let part = 0; part < partCount; part++) {
        if (at + 4 > data.length)
          throw new Error(`Altium 子记录长度截断 @${at}`);
        const length = view.getUint32(at, true);
        at += 4;
        if (length > data.length - at)
          throw new Error(`Altium 子记录越界 @${at}: ${length}`);
        parts.push(data.subarray(at, at + length));
        at += length;
      }
      yield { index, start, end: at, parts };
    }
    if (at !== data.length)
      throw new Error(`Altium 记录流剩余 ${data.length - at} 字节`);
  }
}
/** Compatibility entry point; parsing state belongs to AltiumBinaryReader. */
export function* altiumBinaryRecords(
  data: Uint8Array,
  expectedType: number,
  partCount: number,
  expectedCount: number,
): Generator<AltiumBinaryRecord> {
  yield* new AltiumBinaryReader(
    data,
    expectedType,
    partCount,
    expectedCount,
  ).records();
}
