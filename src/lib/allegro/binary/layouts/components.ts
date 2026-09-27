import type { Raw as RawRecord, Reader } from "../reader";

/** 0x06 */
export function readComponent(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.CompDeviceType = reader.u32();
  record.SymbolName = reader.u32();
  record.FirstInstPtr = reader.u32();
  record.PtrFunctionSlot = reader.u32();
  record.PtrPinNumber = reader.u32();
  record.Fields = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
  }
  return record;
}

/** 0x07 */
export function readComponentInstance(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.Next = reader.u32();
  if (formatVersion >= 172) {
    record.UnknownPtr1 = reader.u32();
    record.Unknown2 = reader.u32();
    record.Unknown3 = reader.u32();
  }
  record.FpInstPtr = reader.u32();
  if (formatVersion < 172) {
    record.Unknown4 = reader.u32();
  }
  record.RefDesStrPtr = reader.u32();
  record.FunctionInstPtr = reader.u32();
  record.X03Ptr = reader.u32();
  record.Unknown5 = reader.u32();
  record.FirstPadPtr = reader.u32();
  return record;
}

/** 0x0f */
export function readFunctionSlot(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.SlotName = reader.u32();
  if (formatVersion >= 174) {
    record.Unknown1 = reader.u32();
  }
  if (formatVersion < 190) {
    reader.skip(32);
  }
  if (formatVersion >= 190) {
    record.CompDeviceTypePtr = reader.u32();
  }
  if (formatVersion >= 172) {
    record.Next = reader.u32();
  }
  record.Ptr0x06 = reader.u32();
  record.Ptr0x11 = reader.u32();
  record.Unknown2 = reader.u32();
  return record;
}

/** 0x10 */
export function readFunctionInstance(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
  }
  record.ComponentInstPtr = reader.u32();
  if (formatVersion >= 174) {
    record.Unknown2 = reader.u32();
  }
  record.PtrX12 = reader.u32();
  record.Unknown3 = reader.u32();
  record.FunctionName = reader.u32();
  record.Slots = reader.u32();
  record.Fields = reader.u32();
  return record;
}

/** 0x2b */
export function readFootprintDefinition(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.FpStrRef = reader.u32();
  record.Unknown1 = reader.u32();
  record.Coords = reader.u32(4);
  record.Next = reader.u32();
  record.FirstInstPtr = reader.u32();
  record.UnknownPtr3 = reader.u32();
  record.UnknownPtr4 = reader.u32();
  record.UnknownPtr5 = reader.u32();
  record.FieldsPtr = reader.u32();
  record.UnknownPtr6 = reader.u32();
  record.UnknownPtr7 = reader.u32();
  record.UnknownPtr8 = reader.u32();
  if (formatVersion >= 164) {
    record.Unknown2 = reader.u32();
  }
  if (formatVersion >= 172) {
    record.Unknown3 = reader.u32();
  }
  return record;
}

/** 0x2d */
export function readFootprintInstance(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.UnknownByte1 = reader.u8();
  record.Layer = reader.u8();
  record.UnknownByte2 = reader.u8();
  record.Key = reader.u32();
  record.Next = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
  }
  if (formatVersion < 172) {
    record.InstRef16x = reader.u32();
  }
  record.Unknown2 = reader.u16();
  record.Unknown3 = reader.u16();
  if (formatVersion >= 172) {
    record.Unknown4 = reader.u32();
  }
  record.Flags = reader.u32();
  record.Rotation = reader.u32();
  record.CoordX = reader.i32();
  record.CoordY = reader.i32();
  if (formatVersion >= 172) {
    record.InstRef = reader.u32();
  }
  record.GraphicPtr = reader.u32();
  record.FirstPadPtr = reader.u32();
  record.TextPtr = reader.u32();
  record.AssemblyPtr = reader.u32();
  record.AreasPtr = reader.u32();
  record.UnknownPtr1 = reader.u32();
  record.UnknownPtr2 = reader.u32();
  return record;
}
