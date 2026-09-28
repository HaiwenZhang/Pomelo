import type { BrdHeader } from "../header";
import type { Reader } from "../reader";
import { parserError } from "../../../parser-error";

export type PadstackComponent = {
  Type: number;
  W: number;
  H: number;
  Z1: number;
  OffsetX: number;
  OffsetY: number;
  Z2: number;
  ShapePtr: number;
};
type PadstackHeader = {
  DrillSize: number;
  DrillMarkSizeX: number;
  DrillMarkSizeY: number;
  DrillMarkShape: number;
  Flags: number;
  DrillChars: number;
  ArrayNX: number;
  ArrayNY: number;
  LayerCount: number;
  ClearanceX: number;
  ClearanceY: number;
  SlotX: number;
  SlotY: number;
  PadType?: number;
  RestrictedLayerSpan?: boolean;
  DrillMetadataWords?: number[];
};
export type PadstackRecord = PadstackHeader & {
  StartLayer: number;
  Key: number;
  Next: number;
  PadStr: number;
  NumFixedCompEntries: number;
  NumCompsPerLayer: number;
  Plated: boolean;
  Components: PadstackComponent[];
};
export type PadstackDimensionsRecord = { Key: number; Next: number };

/** 0x1c: drill information, layer components and trailing padstack entries. */
export function readPadstack(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): PadstackRecord {
  reader.skip(1);
  const trailingEntryCount = reader.u8();
  let startLayer = reader.u8();
  const key = reader.u32();
  const next = reader.u32();
  const padString = reader.u32();

  const header =
    formatVersion < 172
      ? readLegacyPadstackHeader(reader, formatVersion)
      : readModernPadstackHeader(reader, formatVersion);

  if (header.LayerCount > 256) throw parserError("padstackTooManyLayers");
  const fixedComponentCount =
    formatVersion < 165 ? 10 : formatVersion < 172 ? 11 : 21;
  const componentsPerLayer = formatVersion < 172 ? 3 : 4;
  const plated = !!(header.Flags & (formatVersion < 172 ? 0x01 : 0x20));
  const componentCount =
    fixedComponentCount + componentsPerLayer * header.LayerCount;
  const components = Array.from(
    { length: componentCount },
    (_, componentIndex) =>
      readPadstackComponent(
        reader,
        formatVersion,
        componentIndex === componentCount - 1,
      ),
  );
  const trailingEntryBytes = formatVersion < 172 ? 32 : 40;
  reader.skip(trailingEntryCount * trailingEntryBytes);
  // V15 restricted stacks retain an array for every board layer. Later saves
  // compact that array to the populated span (including blind/buried vias).
  if (header.RestrictedLayerSpan) {
    const populated: number[] = [];
    for (let layer = 0; layer < header.LayerCount; layer++) {
      const begin = fixedComponentCount + layer * componentsPerLayer;
      if (
        components
          .slice(begin, begin + componentsPerLayer)
          .some((c) => c.Type !== 0)
      )
        populated.push(layer);
    }
    if (populated.length) {
      const first = populated[0],
        last = populated[populated.length - 1];
      components.splice(fixedComponentCount + (last + 1) * componentsPerLayer);
      components.splice(fixedComponentCount, first * componentsPerLayer);
      startLayer += first;
      header.LayerCount = last - first + 1;
    }
  }
  return {
    StartLayer: startLayer,
    Key: key,
    Next: next,
    PadStr: padString,
    ...header,
    NumFixedCompEntries: fixedComponentCount,
    NumCompsPerLayer: componentsPerLayer,
    Plated: plated,
    Components: components,
  };
}

function readLegacyPadstackHeader(
  reader: Reader,
  formatVersion: number,
): PadstackHeader {
  const drillSize = reader.u32();
  reader.skip(4);
  const drillMarkSizeX = reader.u32();
  const drillMarkSizeY = reader.u32();
  reader.skip(8);
  const drillMarkShape = reader.u8();
  const flags = reader.u8();
  const drillChars = reader.u8();
  reader.skip(1);
  const legacyLayerFlags = reader.u16();
  const arrayNX = reader.u16();
  const arrayNY = reader.u16();
  const layerCount = reader.u16();
  const clearanceX = reader.u32();
  const clearanceY = reader.u32();
  reader.skip(12);
  const slotX = reader.u32();
  const slotY = reader.u32();
  reader.skip(formatVersion >= 165 ? 8 : 4);
  return {
    DrillSize: drillSize,
    DrillMarkSizeX: drillMarkSizeX,
    DrillMarkSizeY: drillMarkSizeY,
    DrillMarkShape: drillMarkShape,
    Flags: flags,
    DrillChars: drillChars,
    ArrayNX: arrayNX,
    ArrayNY: arrayNY,
    LayerCount: layerCount,
    ClearanceX: clearanceX,
    ClearanceY: clearanceY,
    SlotX: slotX,
    SlotY: slotY,
    ...(formatVersion < 160
      ? { RestrictedLayerSpan: (legacyLayerFlags & 1) !== 0 }
      : {}),
  };
}

function readModernPadstackHeader(
  reader: Reader,
  formatVersion: number,
): PadstackHeader {
  reader.skip(12);
  const padType = reader.u8();
  reader.skip(1);
  const flags = reader.u8();
  reader.skip(1);
  reader.skip(8);
  const arrayNX = reader.u16();
  const arrayNY = reader.u16();
  const layerCount = reader.u16();
  reader.skip(2);
  const clearanceX = reader.u32();
  const clearanceY = reader.u32();
  reader.skip(8);
  const drillSize = reader.u32();
  reader.skip(8);
  const slotX = reader.u32();
  const slotY = reader.u32();
  reader.skip(8);
  const drillMarkSizeX = reader.u32();
  const drillMarkSizeY = reader.u32();
  const drillMarkShape = reader.u32();
  const drillChars = reader.u32();
  // Retain the entire extended drill block. Native Padstack Editor confirms
  // backdrill data lives here, not in solder-mask components 14/15. Its
  // layout changes in V180; keep raw words until each field is established.
  const drillMetadataWords = reader.u32(formatVersion >= 180 ? 29 : 21);
  return {
    PadType: padType,
    Flags: flags,
    ArrayNX: arrayNX,
    ArrayNY: arrayNY,
    LayerCount: layerCount,
    ClearanceX: clearanceX,
    ClearanceY: clearanceY,
    DrillSize: drillSize,
    SlotX: slotX,
    SlotY: slotY,
    DrillMarkSizeX: drillMarkSizeX,
    DrillMarkSizeY: drillMarkSizeY,
    DrillMarkShape: drillMarkShape,
    DrillChars: drillChars,
    DrillMetadataWords: drillMetadataWords,
  };
}

function readPadstackComponent(
  reader: Reader,
  formatVersion: number,
  isLastComponent: boolean,
): PadstackComponent {
  const type = reader.u8();
  reader.skip(formatVersion < 172 ? 3 : 7);
  const width = reader.i32();
  const height = reader.i32();
  const z1 = formatVersion >= 172 ? reader.i32() : 0;
  const offsetX = reader.i32();
  const offsetY = reader.i32();
  // In 16.x ShapePtr precedes Z2, and the final component omits Z2.
  let shapePointer: number, z2: number;
  if (formatVersion < 172) {
    shapePointer = reader.u32();
    z2 = isLastComponent ? 0 : reader.u32();
  } else {
    z2 = reader.u32();
    shapePointer = reader.u32();
  }
  return {
    Type: type,
    W: width,
    H: height,
    Z1: z1,
    OffsetX: offsetX,
    OffsetY: offsetY,
    Z2: z2,
    ShapePtr: shapePointer,
  };
}

/** 0x1f: skip dimension names/values after reading their enclosing record links. */
export function readPadstackDimensions(
  reader: Reader,
  { version: formatVersion }: BrdHeader,
): PadstackDimensionsRecord {
  reader.skip(3);
  const key = reader.u32();
  const next = reader.u32();
  reader.skip(formatVersion < 160 ? 46 : 14);
  const dimensionCount = reader.u16();
  const dimensionBytes =
    formatVersion < 160
      ? 500
      : formatVersion >= 175
        ? 384
        : formatVersion >= 162
          ? 280
          : 240;
  const trailerBytes = formatVersion < 160 ? 8 : formatVersion >= 172 ? 8 : 4;
  reader.skip(dimensionCount * dimensionBytes + trailerBytes);
  return { Key: key, Next: next };
}
