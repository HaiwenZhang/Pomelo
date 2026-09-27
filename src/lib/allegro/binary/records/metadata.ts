import type { BrdHeader } from "../header";
import type { Raw as RawRecord, Reader } from "../reader";

/** 0x1a: two linked nets with opaque metadata. */
export function readPairedNets(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): RawRecord {
  // Paired-net metadata: 48 V172 and 64 V174 records in the external
  // corpus. Keep the payload intact; these words are not board geometry.
  if (formatVersion !== 172 && formatVersion !== 174) {
    throw new Error(`尚未验证 V${formatVersion} 的 0x1a 记录布局`);
  }
  const record: RawRecord = {};
  record.Type = reader.u8();
  record.T2 = reader.u16();
  record.Key = reader.u32();
  if (formatVersion >= 174) record.Unknown = reader.u32();
  record.Members = Array.from({ length: 2 }, () => ({
    Net: reader.u32(),
    Next: reader.u32(),
    Metadata: reader.u32(8),
  }));
  return record;
}

/** 0x1d: constraint-set links followed by name and layer-dimension entries. */
export function readConstraintSet(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  record.Next = reader.u32();
  record.NameStrKey = reader.u32();
  record.FieldPtr = reader.u32();
  const nameEntryCount = reader.u16();
  const layerDimensionCount = reader.u16();
  reader.skip(nameEntryCount * 256 + layerDimensionCount * 56);
  if (formatVersion >= 172) reader.skip(4);
  return record;
}

/** 0x21: opaque bytes whose declared size includes the 12-byte record header. */
export function readBlob(reader: Reader): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Size = reader.u32();
  if (record.Size < 12) throw new Error("无效 blob 长度");
  record.Key = reader.u32();
  reader.skip(record.Size - 12);
  return record;
}

/** 0x27: the constraint manager's opaque region ends at the file header's offset. */
export function readConstraintRegion(
  reader: Reader,
  { constraintEnd }: BrdHeader,
): RawRecord {
  const endOffset = constraintEnd - 1;
  if (endOffset < reader.offset) throw new Error("约束块终点无效");
  reader.seek(endOffset);
  return {};
}

/** 0x3c: a counted list of record keys. */
export function readKeyList(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  record.Key = reader.u32();
  if (formatVersion >= 174) reader.skip(4);
  record.NumEntries = reader.u32();
  if (record.NumEntries > 1e6) throw new Error("引用列表过大");
  record.Entries = reader.u32(record.NumEntries);
  return record;
}
