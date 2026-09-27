import type { BrdHeader } from "../header";
import type { Raw as RawRecord, Reader } from "../reader";

/** 0x3b: named text properties and embedded model attachments. */
export function readProperty(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): RawRecord {
  const record: RawRecord = {};
  record.T = reader.u8();
  record.SubType = reader.u16();
  record.Len = reader.u32();
  record.Name = reader.str(128);
  record.Type = reader.str(32);
  record.Unknown1 = reader.u32();
  record.Unknown2 = reader.u32();
  if (formatVersion >= 172) record.Unknown3 = reader.u32();

  if (isEmbeddedModel(record, formatVersion)) {
    record.PayloadKind = "embedded-model";
    record.ValueBytes = reader.bytes(record.Len);
  } else {
    record.Value = reader.str(record.Len);
  }
  return record;
}

function isEmbeddedModel(record: RawRecord, formatVersion: number): boolean {
  // Real V166–V181 attachments independently inflate to step-assembly XML
  // or ACIS BinaryFile. Preserve every compressed byte, not a NUL-terminated
  // locale string. This 2D viewer does not decompress or validate 3D assets.
  const hasModelName =
    record.Name.startsWith("STEP3D_") || /\.sab\.z$/i.test(record.Name);
  const hasAttachmentFlags =
    formatVersion >= 172
      ? record.Unknown2 === 0 && record.Unknown3 === 0x10000
      : record.Unknown2 === 0x10000;
  return (
    record.T === 0 &&
    record.SubType === 0 &&
    record.Type === "" &&
    hasModelName &&
    hasAttachmentFlags
  );
}
