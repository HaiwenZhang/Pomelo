import type { BrdHeader } from "../header";
import type { Reader } from "../reader";
import { isUint32 } from "../record-values";
import { parserError } from "../../../parser-error";

const FONT_DEFINITION_CODE = 8;
export type FontDefinition = {
  Height: number;
  Width: number;
  CharacterSpace: number;
  LineSpace: number;
  StrokeWidth: number;
};
type DefinitionTableHeader = {
  Code: number;
  Key: number;
  Next: number;
  NumItems: number;
  Count: number;
  LastIdx: number;
};
export type DefinitionTableRecord = DefinitionTableHeader & {
  ItemsOffset: number;
  Stride: number;
  Fonts?: FontDefinition[];
};
export type FontDefinitionTable = { Code: 8; Fonts: FontDefinition[] };
function isFontDefinition(value: unknown): value is FontDefinition {
  return (
    typeof value === "object" &&
    value !== null &&
    "Height" in value &&
    isUint32(value.Height) &&
    "Width" in value &&
    isUint32(value.Width) &&
    "CharacterSpace" in value &&
    isUint32(value.CharacterSpace) &&
    "LineSpace" in value &&
    isUint32(value.LineSpace) &&
    "StrokeWidth" in value &&
    isUint32(value.StrokeWidth)
  );
}
export function isFontDefinitionTable(
  value: unknown,
): value is FontDefinitionTable {
  if (
    typeof value !== "object" ||
    value === null ||
    !("Code" in value) ||
    value.Code !== FONT_DEFINITION_CODE ||
    !("Fonts" in value) ||
    !Array.isArray(value.Fonts)
  )
    return false;
  const fonts = value.Fonts;
  if (
    "Count" in value &&
    (!isUint32(value.Count) || fonts.length !== value.Count)
  )
    return false;
  if (
    "NumItems" in value &&
    (!isUint32(value.NumItems) || value.NumItems < fonts.length)
  )
    return false;
  return fonts.every((font: unknown) => isFontDefinition(font));
}

/** 0x36: a capacity-sized table; only Count entries are in use. */
export function readDefinitionTable(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): DefinitionTableRecord {
  const header = readDefinitionTableHeader(reader, formatVersion);
  const entryStride = getDefinitionEntryStride(header.Code, formatVersion);
  const itemsOffset = reader.offset;
  if (header.Code === FONT_DEFINITION_CODE) {
    const fonts = readFontDefinitions(reader, {
      formatVersion,
      capacity: header.NumItems,
      usedCount: header.Count,
      entryStride,
    });
    return {
      ...header,
      ItemsOffset: itemsOffset,
      Stride: entryStride,
      Fonts: fonts,
    };
  }
  reader.skip(entryStride * header.NumItems);
  return { ...header, ItemsOffset: itemsOffset, Stride: entryStride };
}

function readDefinitionTableHeader(
  reader: Reader,
  formatVersion: number,
): DefinitionTableHeader {
  reader.skip(1);
  const code = reader.u16();
  const key = reader.u32();
  const next = reader.u32();
  if (formatVersion >= 172) reader.skip(4);
  const numItems = reader.u32();
  const count = reader.u32();
  const lastIndex = reader.u32();
  reader.skip(4);
  if (formatVersion >= 174) reader.skip(4);
  if (numItems > 1e6 || count > numItems) {
    throw parserError("brdInvalidDefinitionCapacity");
  }
  return {
    Code: code,
    Key: key,
    Next: next,
    NumItems: numItems,
    Count: count,
    LastIdx: lastIndex,
  };
}

function getDefinitionEntryStride(
  definitionCode: number,
  formatVersion: number,
): number {
  const entryBytesByCode: Record<number, number> = {
    2: 88 + (formatVersion >= 164 ? 12 : 0) + (formatVersion >= 172 ? 8 : 0),
    3: (formatVersion >= 172 ? 64 : 32) + (formatVersion >= 174 ? 4 : 0),
    5: 28 + (formatVersion >= 175 ? 4 : 0),
    6: formatVersion >= 172 ? 8 : 208,
    [FONT_DEFINITION_CODE]:
      32 + (formatVersion >= 174 ? 4 : 0) + (formatVersion >= 172 ? 32 : 0),
    11: 1016,
    12: 232,
    13: 200,
    15: 20,
    16: 108 + (formatVersion >= 180 ? 4 : 0),
    18: 1052,
  };
  const entryStride = entryBytesByCode[definitionCode];
  if (!entryStride)
    throw parserError("brdUnsupportedDefinitionTable", {
      detail: definitionCode,
    });
  return entryStride;
}

function readFontDefinitions(
  reader: Reader,
  {
    formatVersion,
    capacity,
    usedCount,
    entryStride,
  }: {
    formatVersion: number;
    capacity: number;
    usedCount: number;
    entryStride: number;
  },
): FontDefinition[] {
  const fonts: FontDefinition[] = [];
  for (let entryIndex = 0; entryIndex < capacity; entryIndex++) {
    const entryOffset = reader.offset;
    const font = readFontDefinition(reader, formatVersion);
    if (entryIndex < usedCount) fonts.push(font);
    reader.seek(entryOffset + entryStride);
  }
  return fonts;
}

function readFontDefinition(
  reader: Reader,
  formatVersion: number,
): FontDefinition {
  reader.skip(8);
  // V174/V175 native Text Setup (ntpcb and DDR5) places spacing at
  // +16/+20, before the extra word; photo width remains at +32.
  // Later layout families retain their existing, unverified mapping.
  const hasSpacingBeforeExtraWord =
    formatVersion === 174 || formatVersion === 175;
  const height = reader.u32();
  const width = reader.u32();
  if (formatVersion >= 174 && !hasSpacingBeforeExtraWord) reader.skip(4);
  const characterSpace = reader.u32();
  const lineSpace = reader.u32();
  reader.skip(hasSpacingBeforeExtraWord ? 8 : 4);
  const strokeWidth = reader.u32();
  return {
    Height: height,
    Width: width,
    CharacterSpace: characterSpace,
    LineSpace: lineSpace,
    StrokeWidth: strokeWidth,
  };
}
