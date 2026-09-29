import type {
  ArcBody,
  FootprintRectangleBody,
  GraphicBody,
  SegmentBody,
  RectangleBody,
  ShapeBody,
  KeepoutBody,
  RawRecord,
} from "../record-types";
import type { Reader } from "../reader";

/** 0x01 */
export function readArc(reader: Reader, formatVersion: number): ArcBody {
  const record: Partial<ArcBody> = {};
  reader.skip(1);
  record.UnknownByte = reader.u8();
  record.SubType = reader.u8();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Parent = reader.u32();
  record.Unknown1 = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown6 = reader.u32();
  }
  record.Width = reader.u32();
  if (formatVersion < 160)
    [record.Width, record.Unknown1] = [record.Unknown1, record.Width];
  record.StartX = reader.i32();
  record.StartY = reader.i32();
  record.EndX = reader.i32();
  record.EndY = reader.i32();
  record.CenterX = formatVersion < 160 ? reader.i32() : reader.float();
  record.CenterY = formatVersion < 160 ? reader.i32() : reader.float();
  record.Radius = formatVersion < 160 ? reader.i32() : reader.float();
  record.BoundingBoxCoords = reader.i32(4);
  return record as ArcBody;
}

/** 0x0e */
export function readFootprintRectangle(
  reader: Reader,
  formatVersion: number,
): FootprintRectangleBody {
  const record: Partial<FootprintRectangleBody> = {};
  record.T = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.FpPtr = reader.u32();
  record.Unknown1 = reader.u32();
  record.Unknown2 = reader.u32();
  if (formatVersion >= 160) record.Unknown3 = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown4 = reader.u32();
    record.Unknown5 = reader.u32();
  }
  record.Coords = reader.i32(4);
  record.UnknownArr = reader.u32(3);
  record.Rotation = reader.u32();
  return record as FootprintRectangleBody;
}

/** 0x14 */
export function readGraphic(
  reader: Reader,
  formatVersion: number,
): GraphicBody {
  const record: Partial<GraphicBody> = {};
  record.Type = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Parent = reader.u32();
  record.Flags = formatVersion < 160 ? 0 : reader.u32();
  if (formatVersion >= 172) {
    record.Unknown2 = reader.u32();
  }
  record.SegmentPtr = reader.u32();
  record.Ptr0x03 = reader.u32();
  record.Ptr0x26 = reader.u32();
  return record as GraphicBody;
}

/** 0x15 / 0x16 / 0x17 */
export function readSegment(
  reader: Reader,
  formatVersion: number,
): SegmentBody {
  const record: Partial<SegmentBody> = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Parent = reader.u32();
  record.Flags = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown2 = reader.u32();
  }
  record.Width = reader.u32();
  if (formatVersion < 160)
    [record.Width, record.Flags] = [record.Flags, record.Width];
  record.StartX = reader.i32();
  record.StartY = reader.i32();
  record.EndX = reader.i32();
  record.EndY = reader.i32();
  return record as SegmentBody;
}

/** 0x24 */
export function readRectangle(
  reader: Reader,
  formatVersion: number,
): RectangleBody {
  const record: Partial<RectangleBody> = {};
  record.Type = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Parent = reader.u32();
  record.Unknown1 = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown2 = reader.u32();
  }
  record.Coords = reader.i32(4);
  record.Ptr2 = reader.u32();
  record.Unknown3 = reader.u32();
  record.Unknown4 = reader.u32();
  record.Rotation = reader.u32();
  return record as RectangleBody;
}

/** 0x28 */
export function readShape(reader: Reader, formatVersion: number): ShapeBody {
  const record: Partial<ShapeBody> = {};
  record.Type = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Ptr1 = reader.u32();
  record.Unknown1 = formatVersion < 160 ? 0 : reader.u32();
  if (formatVersion >= 172) {
    record.Unknown2 = reader.u32();
    record.Unknown3 = reader.u32();
  }
  record.Ptr2 = reader.u32();
  record.Ptr3 = reader.u32();
  record.FirstKeepoutPtr = reader.u32();
  record.FirstSegmentPtr = reader.u32();
  record.Unknown4 = reader.u32();
  record.Unknown5 = reader.u32();
  if (formatVersion >= 172) {
    record.TablePtr = reader.u32();
  }
  record.Ptr6 = reader.u32();
  if (formatVersion < 172) {
    record.TablePtr_16x = reader.u32();
  }
  record.Coords = reader.i32(4);
  return record as ShapeBody;
}

/** 0x34 */
export function readKeepout(
  reader: Reader,
  formatVersion: number,
): KeepoutBody {
  const record: Partial<KeepoutBody> = {};
  record.T = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Ptr1 = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
  }
  record.Flags = formatVersion < 160 ? 0 : reader.u32();
  record.FirstSegmentPtr = reader.u32();
  record.Ptr3 = reader.u32();
  record.Unknown2 = reader.u32();
  return record as KeepoutBody;
}
