import { Reader } from "./reader";

type RecordList = {
  head: number;
  tail: number;
};

export interface BrdHeader {
  magic: number;
  /** Binary layout family, e.g. 172 for 17.2; independent of the writer release. */
  version: number;
  writerVersion: string;
  objectCount: number;
  units: number;
  divisor: number;
  stringCount: number;
  constraintEnd: number;
  layerMap: {
    classId: number;
    recordId: number;
  }[];
  textList: RecordList;
  graphicList?: RecordList;
  sentinelKeys?: readonly number[];
}

const FORMAT_VERSION_BY_MAGIC = new Map([
  [0x130000, 160],
  [0x130400, 162],
  [0x130c00, 164],
  [0x131000, 165],
  [0x131500, 166],
  [0x140400, 172],
  [0x140500, 172],
  [0x140600, 172],
  [0x140700, 172],
  [0x140900, 174],
  [0x140e00, 174],
  // DDR5_RDIMM_ARM: complete record scan requires the V175 table strides.
  // Keep the original magic/writer string; this is a layout family, not a writer release.
  [0x141400, 175],
  [0x141500, 175],
  [0x150000, 180],
  [0x150200, 181],
]);

/** Absolute byte offsets from the beginning of the file. */
interface HeaderLayout {
  listOrder: "tail-first" | "head-first";
  textListOffset: number;
  graphicListOffset: number;
  writerVersionOffset: number;
  unitsOffset: number;
  constraintEndOffset: number;
  stringCountOffset: number;
  divisorOffset: number;
}

const LEGACY_HEADER_LAYOUT: HeaderLayout = {
  listOrder: "tail-first",
  textListOffset: 0x8c,
  graphicListOffset: 0x5c,
  writerVersionOffset: 0xf8,
  unitsOffset: 0x180,
  constraintEndOffset: 0x18c,
  stringCountOffset: 0x194,
  divisorOffset: 0x26c,
};

const V180_HEADER_LAYOUT: HeaderLayout = {
  listOrder: "head-first",
  textListOffset: 0xb4,
  graphicListOffset: 0x84,
  writerVersionOffset: 0x124,
  unitsOffset: 0x18c,
  constraintEndOffset: 0x28,
  stringCountOffset: 0x34,
  divisorOffset: 0x26c,
};

const V181_HEADER_LAYOUT: HeaderLayout = {
  ...V180_HEADER_LAYOUT,
  writerVersionOffset: 0x144,
  unitsOffset: 0x1ac,
  divisorOffset: 0x28c,
};

const OBJECT_COUNT_OFFSET = 0x14;
const WRITER_VERSION_BYTES = 60;
// The layer map stays at the same position across all supported header layouts.
const LAYER_MAP_OFFSET = 0x428;
const LAYER_MAP_ENTRY_COUNT = 25;
const V18_LISTS_OFFSET = 0x3c;
const V18_LIST_COUNT = 28;

export class AllegroHeaderReader {
  constructor(readonly buffer: ArrayBuffer) {}

  read(): BrdHeader {
    const reader = new Reader(this.buffer);
    const magic = reader.u32();
    const formatVersion = resolveFormatVersion(magic);
    const layout = getHeaderLayout(formatVersion);
    const objectCount = readUint32At(reader, OBJECT_COUNT_OFFSET);
    const sentinelKeys = formatVersion >= 180 ? readListSentinels(reader) : [];
    const textList = readRecordList(
      reader,
      layout.textListOffset,
      layout.listOrder,
    );
    const graphicList = readRecordList(
      reader,
      layout.graphicListOffset,
      layout.listOrder,
    );

    reader.seek(layout.writerVersionOffset);
    const writerVersion = reader.str(WRITER_VERSION_BYTES);
    reader.seek(layout.unitsOffset);
    const units = reader.u8();
    const constraintEnd = readUint32At(reader, layout.constraintEndOffset);
    const stringCount = readUint32At(reader, layout.stringCountOffset);
    const divisor = readUint32At(reader, layout.divisorOffset);
    if (divisor === 0) throw new Error("无效 BRD 单位除数");

    return {
      magic,
      version: formatVersion,
      writerVersion,
      objectCount,
      units,
      divisor,
      stringCount,
      constraintEnd,
      layerMap: readLayerMap(reader),
      textList,
      graphicList,
      sentinelKeys,
    };
  }
}

function resolveFormatVersion(magic: number): number {
  // The low byte identifies a revision within the same binary layout family.
  const formatVersion = FORMAT_VERSION_BY_MAGIC.get(magic & 0xffffff00);
  if (formatVersion === undefined) {
    throw new Error(`暂不支持的 BRD 格式：0x${magic.toString(16)}`);
  }
  return formatVersion;
}

function getHeaderLayout(formatVersion: number): HeaderLayout {
  if (formatVersion >= 181) return V181_HEADER_LAYOUT;
  if (formatVersion >= 180) return V180_HEADER_LAYOUT;
  return LEGACY_HEADER_LAYOUT;
}

function readUint32At(reader: Reader, byteOffset: number): number {
  reader.seek(byteOffset);
  return reader.u32();
}

function readRecordList(
  reader: Reader,
  byteOffset: number,
  listOrder: HeaderLayout["listOrder"],
): RecordList {
  reader.seek(byteOffset);
  const firstKey = reader.u32();
  const secondKey = reader.u32();
  return listOrder === "head-first"
    ? { head: firstKey, tail: secondKey }
    : { head: secondKey, tail: firstKey };
}

function readListSentinels(reader: Reader): number[] {
  // V18 stores 28 consecutive head/tail pairs.
  reader.seek(V18_LISTS_OFFSET);
  const sentinelKeys = new Set<number>();
  for (let listIndex = 0; listIndex < V18_LIST_COUNT; listIndex++) {
    reader.skip(4);
    const tailKey = reader.u32();
    if (tailKey !== 0) sentinelKeys.add(tailKey);
  }
  return [...sentinelKeys];
}

function readLayerMap(reader: Reader): BrdHeader["layerMap"] {
  reader.seek(LAYER_MAP_OFFSET);
  return Array.from({ length: LAYER_MAP_ENTRY_COUNT }, () => ({
    classId: reader.u32(),
    recordId: reader.u32(),
  }));
}
