import type { BrdHeader } from "../header";
import type { Reader } from "../reader";

type PropertyHeader = {
  T: number;
  SubType: number;
  Len: number;
  Name: string;
  Type: string;
  Unknown1: number;
  Unknown2: number;
  Unknown3?: number;
};
export type PropertyRecord = PropertyHeader &
  (
    | { PayloadKind: "embedded-model"; ValueBytes: Uint8Array; Value?: never }
    | { Value: string; PayloadKind?: never; ValueBytes?: never }
  );

/** 0x3b: named text properties and embedded model attachments. */
export function readProperty(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): PropertyRecord {
  const record = {
    T: reader.u8(),
    SubType: reader.u16(),
    Len: reader.u32(),
    Name: reader.str(128),
    Type: reader.str(32),
    Unknown1: reader.u32(),
    Unknown2: reader.u32(),
    ...(formatVersion >= 172 ? { Unknown3: reader.u32() } : {}),
  };

  return isEmbeddedModel(record, formatVersion)
    ? {
        ...record,
        PayloadKind: "embedded-model",
        ValueBytes: reader.bytes(record.Len),
      }
    : { ...record, Value: reader.str(record.Len) };
}

function isEmbeddedModel(
  record: PropertyHeader,
  formatVersion: number,
): boolean {
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
