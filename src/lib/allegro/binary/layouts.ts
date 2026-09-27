import type { Raw as RawRecord, Reader } from "./reader";
import * as geometry from "./layouts/geometry";
import * as components from "./layouts/components";
import * as pads from "./layouts/pads";
import * as connectivity from "./layouts/connectivity";
import * as text from "./layouts/text";
import * as films from "./layouts/films";
import * as metadata from "./layouts/metadata";

type FixedLayoutDecoder = (reader: Reader, formatVersion: number) => RawRecord;

const FIXED_LAYOUT_DECODERS = new Map<number, FixedLayoutDecoder>([
  // Geometry
  [0x01, geometry.readArc],
  [0x0e, geometry.readFootprintRectangle],
  [0x14, geometry.readGraphic],
  [0x15, geometry.readSegment],
  [0x16, geometry.readSegment],
  [0x17, geometry.readSegment],
  [0x24, geometry.readRectangle],
  [0x28, geometry.readShape],
  [0x34, geometry.readKeepout],
  // Components
  [0x06, components.readComponent],
  [0x07, components.readComponentInstance],
  [0x0f, components.readFunctionSlot],
  [0x10, components.readFunctionInstance],
  [0x2b, components.readFootprintDefinition],
  [0x2d, components.readFootprintInstance],
  // Pads
  [0x08, pads.readPinNumber],
  [0x0c, pads.readPinDefinition],
  [0x0d, pads.readPad],
  [0x11, pads.readPinName],
  [0x29, pads.readPin],
  [0x32, pads.readPlacedPad],
  [0x33, pads.readVia],
  // Connectivity
  [0x04, connectivity.readNetAssignment],
  [0x05, connectivity.readTrack],
  [0x09, connectivity.readFillLink],
  [0x1b, connectivity.readNet],
  [0x23, connectivity.readRatline],
  [0x2e, connectivity.readConnection],
  // Text
  [0x30, text.readTextWrapper],
  // Films
  [0x38, films.readFilm],
  [0x39, films.readFilmLayerList],
  [0x3a, films.readFilmListNode],
  // Metadata
  [0x0a, metadata.readDesignRuleCheck],
  [0x12, metadata.readCrossReference],
  [0x20, metadata.readUnknownRecord0x20],
  [0x22, metadata.readUnknownRecord0x22],
  [0x26, metadata.readMatchGroup],
  [0x2c, metadata.readTable],
  [0x2f, metadata.readUnknownRecord0x2f],
  [0x35, metadata.readFileReference],
  [0x37, metadata.readPointerArray],
  [0x3e, metadata.readOrderedKeyList],
]);

/**
 * Reads fixed record bodies after the caller consumes the type byte.
 * Versions use the file format convention: 166 = 16.6, 172 = 17.2.
 * Unknown fields retain their source names until their meaning is established.
 */
export class AllegroFixedLayoutReader {
  constructor(
    readonly reader: Reader,
    readonly version: number,
  ) {}

  /** Unsupported types return undefined without consuming any bytes. */
  read(recordType: number): RawRecord | undefined {
    const decodeRecord = FIXED_LAYOUT_DECODERS.get(recordType);
    return decodeRecord?.(this.reader, this.version);
  }
}
