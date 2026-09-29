import type { BrdHeader } from "../header";
import type { RawRecord } from "../record-types";
import type { Reader } from "../reader";
import { parserError } from "../../../parser-error";

/** 0x1a: two linked nets with opaque metadata. */
export function readPairedNets(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): RawRecord {
  // Paired-net metadata: V251 converted boards retain the 92-byte V174
  // layout (V15/V172 use 88 bytes). Keep the opaque member words intact.
  if (![152, 157, 172, 174, 251].includes(formatVersion)) {
    throw parserError("brdUnverifiedMetadataRecord", { detail: formatVersion });
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
  if (formatVersion >= 160) record.FieldPtr = reader.u32();
  const nameEntryCount = reader.u16();
  const layerDimensionCount = reader.u16();
  reader.skip(
    nameEntryCount * 256 +
      layerDimensionCount * (formatVersion < 160 ? 136 : 56) +
      (formatVersion < 160 ? 12 : 0),
  );
  if (formatVersion >= 172) reader.skip(4);
  return record;
}

/** 0x21: opaque bytes whose declared size includes the 12-byte record header. */
export function readBlob(reader: Reader): RawRecord {
  const record: RawRecord = {};
  reader.skip(3);
  const size = reader.u32();
  record.Size = size;
  if (size < 12) throw parserError("brdInvalidBlobLength");
  record.Key = reader.u32();
  reader.skip(size - 12);
  return record;
}

/** 0x27: the constraint manager's opaque region ends at the file header's offset. */
export function readConstraintRegion(
  reader: Reader,
  { constraintEnd }: BrdHeader,
): RawRecord {
  const endOffset = constraintEnd - 1;
  if (endOffset < reader.offset) throw parserError("brdInvalidConstraintEnd");
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
  const count = reader.u32();
  record.NumEntries = count;
  if (count > 1e6) throw parserError("brdReferenceListTooLarge");
  record.Entries = reader.u32(count);
  return record;
}
