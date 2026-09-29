import type {
  NetAssignmentBody,
  TrackBody,
  NetBody,
  RawRecord,
} from "../record-types";
import type { Reader } from "../reader";

/** 0x04 */
export function readNetAssignment(
  reader: Reader,
  formatVersion: number,
): NetAssignmentBody {
  const record: Partial<NetAssignmentBody> = {};
  record.Type = reader.u8();
  record.R = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Net = reader.u32();
  record.ConnItem = reader.u32();
  if (formatVersion >= 174) {
    record.Unknown = reader.u32();
  }
  return record as NetAssignmentBody;
}

/** 0x05 */
export function readTrack(reader: Reader, formatVersion: number): TrackBody {
  const record: Partial<TrackBody> = {};
  reader.skip(1);
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.NetAssignment = reader.u32();
  record.UnknownPtr1 = reader.u32();
  if (formatVersion >= 160) {
    record.Unknown2 = reader.u32();
    record.Unknown3 = reader.u32();
  }
  record.UnknownPtr2a = reader.u32();
  record.UnknownPtr2b = reader.u32();
  if (formatVersion >= 160) record.Unknown4 = reader.u32();
  record.UnknownPtr3a = reader.u32();
  record.UnknownPtr3b = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown5a = reader.u32();
    record.Unknown5b = reader.u32();
  }
  record.FirstSegPtr = reader.u32();
  record.UnknownPtr5 = reader.u32();
  record.Unknown6 = reader.u32();
  return record as TrackBody;
}

/** 0x09 */
export function readFillLink(reader: Reader, formatVersion: number): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.UnknownArray = reader.u32(4);
  if (formatVersion >= 172) {
    record.Unknown1 = reader.u32();
  }
  record.UnknownPtr1 = reader.u32();
  record.UnknownPtr2 = reader.u32();
  record.Unknown2 = reader.u32();
  if (formatVersion >= 160) {
    record.UnknownPtr3 = reader.u32();
    record.UnknownPtr4 = reader.u32();
  }
  if (formatVersion >= 174) {
    record.Unknown3 = reader.u32();
  }
  return record;
}

/** 0x1b */
export function readNet(reader: Reader, formatVersion: number): NetBody {
  const record: Partial<NetBody> = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.NetName = reader.u32();
  if (formatVersion >= 160) record.Unknown1 = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown2 = reader.u32();
  }
  record.Type = reader.u32();
  record.Assignment = reader.u32();
  record.Ratline = reader.u32();
  record.FieldsPtr = reader.u32();
  record.MatchGroupPtr = reader.u32();
  record.ModelPtr = reader.u32();
  record.UnknownPtr4 = reader.u32();
  record.UnknownPtr5 = reader.u32();
  record.UnknownPtr6 = reader.u32();
  return record as NetBody;
}

/** 0x23 */
export function readRatline(reader: Reader, formatVersion: number): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.Layer = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.Flags = reader.u32(formatVersion < 160 ? 1 : 2);
  record.Ptr1 = reader.u32();
  record.Ptr2 = reader.u32();
  record.Ptr3 = reader.u32();
  record.Coords = reader.i32(5);
  record.Unknown1 = reader.u32(4);
  if (formatVersion >= 164) {
    record.Unknown2 = reader.u32(4);
  }
  if (formatVersion >= 174) {
    record.Unknown3 = reader.u32();
  }
  return record;
}

/** 0x2e */
export function readConnection(
  reader: Reader,
  formatVersion: number,
): RawRecord {
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.T2 = reader.u16();
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.NetAssignment = reader.u32();
  record.Unknown1 = reader.u32();
  record.CoordX = reader.u32();
  record.CoordY = reader.u32();
  record.Connection = reader.u32();
  record.Unknown2 = reader.u32();
  if (formatVersion >= 172) {
    record.Unknown3 = reader.u32();
  }
  return record;
}
