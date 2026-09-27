import type { BrdHeader } from "../header";
import type { Reader } from "../reader";

export type SignalIntegrityModelRecord = {
  Type: number;
  T2: number;
  Key: number;
  Next: number;
  Unknown2?: number;
  Unknown3?: number;
  StrPtr: number;
  Size: number;
  String: string;
  Unknown4?: number;
};
export type TextGraphicRecord = {
  T: number;
  Layer: number;
  Key: number;
  StrGraphicWrapperPtr: number;
  CoordsX: number;
  CoordsY: number;
  Len: number;
  Value: string;
};

/** 0x1e: signal-integrity model links and netlist text. */
export function readSignalIntegrityModel(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): SignalIntegrityModelRecord {
  const type = reader.u8();
  const t2 = reader.u16();
  const key = reader.u32();
  const next = reader.u32();
  // Present already in V162 (all eight SI records in at91sam9m10).
  // Omitting this word can mistake an empty model's Size for end-of-file.
  const versionFields =
    formatVersion >= 162
      ? { Unknown2: reader.u16(), Unknown3: reader.u16() }
      : {};
  const stringPointer = reader.u32();
  const size = reader.u32();
  const value = reader.str(size);
  const modernFields = formatVersion >= 172 ? { Unknown4: reader.u32() } : {};
  return {
    Type: type,
    T2: t2,
    Key: key,
    Next: next,
    ...versionFields,
    StrPtr: stringPointer,
    Size: size,
    String: value,
    ...modernFields,
  };
}

/** 0x31: placed text linked to its style wrapper. */
export function readTextGraphic(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): TextGraphicRecord {
  const type = reader.u8();
  const layer = reader.u16();
  const key = reader.u32();
  const wrapperPointer = reader.u32();
  const x = reader.i32();
  const y = reader.i32();
  reader.skip(2);
  const length = reader.u16();
  if (formatVersion >= 174) reader.skip(4);
  const value = reader.str(length);
  return {
    T: type,
    Layer: layer,
    Key: key,
    StrGraphicWrapperPtr: wrapperPointer,
    CoordsX: x,
    CoordsY: y,
    Len: length,
    Value: value,
  };
}
