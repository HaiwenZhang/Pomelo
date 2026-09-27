import type { Raw as RawRecord, Reader } from "../reader";

/** 0x08 */
export function readPinNumber(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.R = reader.u16();
  record.Key = reader.u32();
  if (formatVersion >= 172) {
    record.Previous = reader.u32();
  }
  if (formatVersion < 172) {
    record.StrPtr16x = reader.u32();
  }
  record.Next = reader.u32();
  if (formatVersion >= 172) {
    record.StrPtr = reader.u32();
  }
  record.PinNamePtr = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
  }
  record.Ptr4 = reader.u32();
  return record;
}

/** 0x0c */
export function readPinDefinition(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.T = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Unknown1 = reader.u32();
  record.Unknown2 = reader.u32();
  if (formatVersion < 172) {
    record.Shape = reader.u8();
    record.DrillChar = reader.u8();
    record.UnknownPadding = reader.u16();
  }
  if (formatVersion >= 172) {
    record.Shape16x = reader.u32();
    record.DrillChars = reader.u32();
    record.Unknown_16x = reader.u32();
  }
  record.Unknown4 = reader.u32();
  if (formatVersion >= 180) {
    record.Unknown5 = reader.u32();
  }
  record.Coords = reader.i32(2);
  record.Size = reader.i32(2);
  record.GroupPtr = reader.u32();
  record.Unknown6 = reader.u32();
  record.Unknown7 = reader.u32();
  if (formatVersion >= 174 && formatVersion < 180) {
    record.Unknown8 = reader.u32();
  }
  return record;
}

/** 0x0d */
export function readPad(reader: Reader, formatVersion: number): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.NameStrId = reader.u32();
  record.Next = reader.u32();
  if (formatVersion >= 174) {
    record.Unknown1 = reader.u32();
  }
  record.CoordsX = reader.i32();
  record.CoordsY = reader.i32();
  record.PadStack = reader.u32();
  record.Unknown2 = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown3 = reader.u32();
  }
  record.Flags = reader.u32();
  record.Rotation = reader.u32();
  return record;
}

/** 0x11 */
export function readPinName(reader: Reader, formatVersion: number): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.R = reader.u16();
  record.Key = reader.u32();
  record.PinNameStrPtr = reader.u32();
  record.Next = reader.u32();
  record.PinNumberPtr = reader.u32();
  record.Unknown1 = reader.u32();
  if (formatVersion >= 174) {
    record.Unknown2 = reader.u32();
  }
  return record;
}

/** 0x29 */
export function readPin(reader: Reader): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.T = reader.u16();
  record.Key = reader.u32();
  record.Ptr1 = reader.u32();
  record.Ptr2 = reader.u32();
  record.Null = reader.u32();
  record.Ptr3 = reader.u32();
  record.Coord1 = reader.i32();
  record.Coord2 = reader.i32();
  record.PtrPadstack = reader.u32();
  record.Unknown1 = reader.u32();
  record.PtrX30 = reader.u32();
  record.Unknown2 = reader.u32();
  record.Unknown3 = reader.u32();
  record.Unknown4 = reader.u32();
  return record;
}

/** 0x32 */
export function readPlacedPad(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.NetPtr = reader.u32();
  record.Flags = reader.u32();
  if (formatVersion >= 172) {
    record.Prev = reader.u32();
  }
  record.NextInFp = reader.u32();
  record.ParentFp = reader.u32();
  record.Track = reader.u32();
  record.PadPtr = reader.u32();
  record.Ptr6 = reader.u32();
  record.Ratline = reader.u32();
  record.PtrPinNumber = reader.u32();
  record.NextInCompInst = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown2 = reader.u32();
  }
  record.NameText = reader.u32();
  record.Ptr11 = reader.u32();
  record.Coords = reader.i32(4);
  return record;
}

/** 0x33 */
export function readVia(reader: Reader, formatVersion: number): RawRecord {
  const record: RawRecord = {};
  reader.skip(1);
  record.LayerInfo = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.NetPtr = reader.u32();
  record.Unknown2 = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown3 = reader.u32();
  }
  record.UnknownPtr1 = reader.u32();
  if (formatVersion >= 172) {
    record.UnknownPtr2 = reader.u32();
  }
  record.CoordsX = reader.i32();
  record.CoordsY = reader.i32();
  record.Connection = reader.u32();
  record.Padstack = reader.u32();
  record.UnknownPtr5 = reader.u32();
  record.UnknownPtr6 = reader.u32();
  record.Unknown4 = reader.u32();
  record.Unknown5 = reader.u32();
  record.BoundingBoxCoords = reader.i32(4);
  return record;
}
