import type { BrdHeader } from "../header";
import type { FieldBody } from "../record-types";
import type { Reader } from "../reader";
import { parserError } from "../../../parser-error";

/** 0x03: a property field whose subtype determines the payload layout. */
export function readField(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): FieldBody {
  const record = readFieldHeader(reader, formatVersion);
  readFieldPayload(reader, record, formatVersion);
  return record;
}

function readFieldHeader(reader: Reader, formatVersion: number): FieldBody {
  reader.skip(1);
  const Hdr1 = reader.u16();
  const Key = reader.u32();
  const Next = reader.u32();
  if (formatVersion >= 172) reader.skip(4);
  const SubType = reader.u8();
  reader.skip(1);
  const Size = reader.u16();
  if (formatVersion >= 172) reader.skip(4);
  return { Hdr1, Key, Next, SubType, Size };
}

function isDimensionSettings(
  record: FieldBody,
  formatVersion: number,
): boolean {
  // V174/V175 property 755 carries 80 bytes of dimension settings, not
  // text. Native ntpcb datum dimensions and DDR5 member geometry confirm
  // the role. Preserve NULs and undecoded fields; other properties retain
  // strict text decoding diagnostics.
  return (
    (formatVersion === 174 || formatVersion === 175) &&
    record.Hdr1 === 755 &&
    record.SubType === 0x73 &&
    record.Size === 80
  );
}

function readFieldPayload(
  reader: Reader,
  record: FieldBody,
  formatVersion: number,
): void {
  if (isDimensionSettings(record, formatVersion)) {
    record.PayloadKind = "dimension-settings";
    record.ValueBytes = reader.bytes(record.Size);
    return;
  }

  switch (record.SubType) {
    case 0x65:
      return;
    case 0x64:
    case 0x66:
    case 0x67:
    case 0x6a:
      record.Value = reader.u32();
      return;
    case 0x69:
      record.Value = reader.u32(2);
      return;
    case 0x68:
    case 0x6b:
    case 0x6d:
    case 0x6e:
    case 0x6f:
    case 0x71:
    case 0x73:
    case 0x78:
      record.Value = reader.str(record.Size);
      return;
    case 0x6c: {
      const entryCount = reader.u32();
      reader.skip(entryCount * 4);
      return;
    }
    case 0x72:
      record.Words = readFieldWords(reader);
      return;
    case 0x70:
    case 0x74: {
      const wordCount = reader.u16();
      const byteCount = reader.u16();
      reader.skip(byteCount + 4 * wordCount);
      return;
    }
    case 0xf6:
      reader.skip(80);
      return;
    default:
      if (record.Size === 4 || record.Size === 8) {
        record.Value = reader.u32(record.Size / 4);
        return;
      }
      throw parserError("brdUnsupportedFieldSubtype", {
        detail: record.SubType,
      });
  }
}

function readFieldWords(reader: Reader): number[] {
  // GTX1660TI field 0x72 carries a word count followed by that many words;
  // Size is not a byte stride (the first sample says 56 for six words).
  const wordCount = reader.u32();
  if (wordCount > 1e6) throw parserError("brdFieldArrayTooLarge");
  return reader.u32(wordCount);
}
