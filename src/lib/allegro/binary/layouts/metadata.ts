import type { Raw as RawRecord, Reader } from "../reader";

/** 0x0a */
export function readDesignRuleCheck(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.T = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  if (formatVersion >= 160) record.Unknown1 = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown2 = reader.u32();
  }
  record.Coords = reader.i32(4);
  record.Unknown4 = reader.u32(4);
  record.Unknown5 = reader.u32(5);
  if (formatVersion >= 174) {
    record.Unknown6 = reader.u32();
  }
  return record;
}

/** 0x12 */
export function readCrossReference(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.R = reader.u16();
  record.Key = reader.u32();
  record.Ptr1 = reader.u32();
  record.Ptr2 = reader.u32();
  record.Ptr3 = reader.u32();
  record.Unknown1 = reader.u32();
  if (formatVersion >= 165) {
    record.Unknown2 = reader.u32();
  }
  if (formatVersion >= 174) {
    record.Unknown3 = reader.u32();
  }
  return record;
}

/** 0x20 */
export function readUnknownRecord0x20(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.R = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.UnknownArray1 = reader.u32(7);
  if (formatVersion >= 174) {
    record.UnknownArray2 = reader.u32(10);
  }
  return record;
}

/** 0x22 */
export function readUnknownRecord0x22(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.T2 = reader.u16();
  record.Key = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
  }
  record.UnknownArray = reader.u32(8);
  return record;
}

/** 0x26 */
export function readMatchGroup(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.R = reader.u16();
  record.Key = reader.u32();
  record.MemberPtr = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
  }
  record.GroupPtr = reader.u32();
  record.ConstPtr = reader.u32();
  if (formatVersion >= 174) {
    record.Unknown2 = reader.u32();
  }
  return record;
}

/** 0x2c */
export function readTable(reader: Reader, formatVersion: number): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.SubType = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
    record.Unknown2 = reader.u32();
    record.Unknown3 = reader.u32();
  }
  record.StringPtr = reader.u32();
  if (formatVersion >= 160 && formatVersion < 172) {
    record.Unknown4 = reader.u32();
  }
  record.Ptr1 = reader.u32();
  record.Ptr2 = reader.u32();
  record.Ptr3 = reader.u32();
  record.Flags = formatVersion < 160 ? 0 : reader.u32();
  return record;
}

/** 0x2f */
export function readUnknownRecord0x2f(reader: Reader): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.T2 = reader.u16();
  record.Key = reader.u32();
  record.UnknownArray = reader.u32(6);
  return record;
}

/** 0x35 */
export function readFileReference(reader: Reader): RawRecord {
  const record: RawRecord = {};
  record.T2 = reader.u8();
  record.T3 = reader.u16();
  reader.skip(120);
  return record;
}

/** 0x37 */
export function readPointerArray(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.T = reader.u8();
  record.T2 = reader.u16();
  record.Key = reader.u32();
  record.GroupPtr = reader.u32();
  record.Next = reader.u32();
  record.Capacity = reader.u32();
  record.Count = reader.u32();
  record.Unknown2 = reader.u32();
  if (formatVersion >= 174) {
    record.Unknown3 = reader.u32();
  }
  record.Ptrs = reader.u32(100);
  return record;
}

/** 0x3e */
export function readOrderedKeyList(reader: Reader): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.Unknown = reader.u32(9);
  return record;
}
