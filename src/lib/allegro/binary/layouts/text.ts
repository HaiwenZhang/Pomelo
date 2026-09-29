import type { TextWrapperBody, RawRecord } from "../record-types";
import type { Reader } from "../reader";

/** 0x30 */
export function readTextWrapper(
  reader: Reader,
  formatVersion: number,
): TextWrapperBody {
  const record: Partial<TextWrapperBody> = {};
  record.Type = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  if (formatVersion < 160) {
    record.Unknown4 = reader.u32();
    record.Rotation = reader.u32();
    record.Font16x = reader.u32();
    record.CoordsX = reader.u32();
    record.CoordsY = reader.u32();
    record.StrGraphicPtr = reader.u32();
    record.PtrGroup_16x = reader.u32();
    return record as TextWrapperBody;
  }
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
    record.Unknown2 = reader.u32();
    record.Font = reader.u32();
    record.Ptr1 = reader.u32();
  }
  if (formatVersion >= 174) {
    record.Unknown3 = reader.u32();
  }
  record.StrGraphicPtr = reader.u32();
  if (formatVersion >= 172) {
    record.PtrGroup_17x = reader.u32();
  }
  if (formatVersion < 172) {
    record.Unknown4 = reader.u32();
    record.Font16x = reader.u32();
  }
  if (formatVersion >= 172) {
    record.Ptr2 = reader.u32();
  }
  record.CoordsX = reader.u32();
  record.CoordsY = reader.u32();
  record.Unknown5 = reader.u32();
  record.Rotation = reader.u32();
  if (formatVersion < 172) {
    record.PtrGroup_16x = reader.u32();
  }
  return record as TextWrapperBody;
}
