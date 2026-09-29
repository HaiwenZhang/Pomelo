import type { RawRecord } from "../record-types";
import type { Reader } from "../reader";

/** 0x38 */
export function readFilm(reader: Reader, formatVersion: number): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.LayerList = reader.u32();
  if (formatVersion < 166) {
    record.FilmName = reader.str(20);
  }
  if (formatVersion >= 166) {
    record.LayerNameStr = reader.u32();
    record.Unknown2 = reader.u32();
  }
  record.UnknownArray1 = reader.u32(7);
  if (formatVersion >= 174) {
    record.Unknown3 = reader.u32();
  }
  return record;
}

/** 0x39 */
export function readFilmLayerList(reader: Reader): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.Parent = reader.u32();
  record.Head = reader.u32();
  record.X = reader.u16(22);
  return record;
}

/** 0x3a */
export function readFilmListNode(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  reader.skip(1);
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Unknown = reader.u32();
  if (formatVersion >= 174) {
    record.Unknown1 = reader.u32();
  }
  return record;
}
