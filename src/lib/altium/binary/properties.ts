import { cooperative } from "../../cooperative";
export interface AltiumPropertiesRecord {
  offset: number;
  flags: number;
  raw: Uint8Array;
  fields: Map<string, string>;
  utf8Fields: Map<string, string>;
}
const latin1 = new TextDecoder("latin1"),
  utf8 = new TextDecoder("utf-8", { fatal: true });
export function altiumProperty(record: AltiumPropertiesRecord, key: string) {
  const upper = key.toUpperCase();
  return record.utf8Fields.get(upper) ?? record.fields.get(upper);
}
/** Property-bearing Altium streams use 24-bit lengths with high-byte flags.
 * Retain original payloads so unknown records are not reinterpreted as text. */
export class AltiumPropertyReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly expectedCount: number,
  ) {}
  async read(signal?: AbortSignal): Promise<AltiumPropertiesRecord[]> {
    const { data, expectedCount } = this;
    signal?.throwIfAborted();
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength),
      records: AltiumPropertiesRecord[] = [],
      pause = cooperative(signal);
    let cursor = 0;
    while (cursor < data.length) {
      if (records.length % 256 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      if (cursor > data.length - 4)
        throw new Error("Altium 属性流长度字段截断");
      const at = cursor,
        word = view.getUint32(cursor, true),
        length = word & 0xffffff,
        flags = word >>> 24;
      cursor += 4;
      if (length > data.length - cursor)
        throw new Error(`Altium 属性记录越界 ${at}`);
      const raw = data.subarray(cursor, cursor + length),
        fields = new Map<string, string>(),
        utf8Fields = new Map<string, string>();
      cursor += length;
      if (flags === 0) {
        // Latin-1 decoding preserves one code unit per byte. Decode once per
        // record; UTF-8 overrides still use the original byte slice and strict decoder.
        const text = latin1.decode(raw);
        let begin = 0;
        while (begin < raw.length) {
          if (raw[begin] === 0) {
            begin++;
            continue;
          }
          if (raw[begin] === 124) {
            begin++;
            continue;
          }
          let end = begin;
          while (end < raw.length && raw[end] !== 124 && raw[end] !== 0) end++;
          let equal = begin;
          while (equal < end && raw[equal] !== 61) equal++;
          if (equal < end) {
            let key = text.slice(begin, equal).trim().toUpperCase();
            const isUtf8 = key.startsWith("%UTF8%");
            if (isUtf8) key = key.slice(6);
            if (key) {
              const value = isUtf8
                ? utf8.decode(raw.subarray(equal + 1, end))
                : text.slice(equal + 1, end);
              (isUtf8 ? utf8Fields : fields).set(key, value.trim());
            }
          }
          begin = end + 1;
        }
      }
      records.push({ offset: at, flags, raw, fields, utf8Fields });
    }
    if (records.length !== expectedCount)
      throw new Error(
        `Altium 属性记录数量不符 ${records.length}/${expectedCount}`,
      );
    return records;
  }
}
/** Compatibility entry point; parsing state belongs to AltiumPropertyReader. */
export async function readAltiumProperties(
  data: Uint8Array,
  expectedCount: number,
  signal?: AbortSignal,
): Promise<AltiumPropertiesRecord[]> {
  return new AltiumPropertyReader(data, expectedCount).read(signal);
}
