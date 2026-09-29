import type { BrdHeader } from "./header";
import { AllegroFixedLayoutReader } from "./layouts";
import type { KnownRecordType, RecordBodies, RawRecord } from "./record-types";
import type { Reader } from "./reader";
import { getScannableRecordByteLength } from "./record-scan";
import { readDefinitionTable } from "./records/definitions";
import { readField } from "./records/fields";
import { readLayerList } from "./records/layers";
import {
  readBlob,
  readConstraintRegion,
  readConstraintSet,
  readKeyList,
  readPairedNets,
} from "./records/metadata";
import { readPadstack, readPadstackDimensions } from "./records/padstacks";
import { readProperty } from "./records/properties";
import { readSignalIntegrityModel, readTextGraphic } from "./records/text";
import { parserError } from "../../parser-error";

type VariableRecordDecoder = (reader: Reader, header: BrdHeader) => object;

const VARIABLE_RECORD_DECODERS = new Map<number, VariableRecordDecoder>([
  [0x03, readField],
  [0x1a, readPairedNets],
  [0x1c, readPadstack],
  [0x1d, readConstraintSet],
  [0x1e, readSignalIntegrityModel],
  [0x1f, readPadstackDimensions],
  [0x21, readBlob],
  [0x27, readConstraintRegion],
  [0x2a, readLayerList],
  [0x31, readTextGraphic],
  [0x36, readDefinitionTable],
  [0x3b, readProperty],
  [0x3c, readKeyList],
]);

/** Reads bodies after Reader.recordType consumes a modern or packed legacy tag. */
export class AllegroRecordReader {
  private readonly fixedReader: AllegroFixedLayoutReader;
  private readonly scanByteLengths: Uint16Array;
  constructor(
    readonly reader: Reader,
    readonly header: BrdHeader,
  ) {
    this.fixedReader = new AllegroFixedLayoutReader(reader, header.version);
    // Layout decisions depend only on the file version, not each record.
    this.scanByteLengths = Uint16Array.from(
      { length: 0x3f },
      (_, type) => getScannableRecordByteLength(type, header.version) ?? 0,
    );
  }

  read<T extends KnownRecordType>(recordType: T): RecordBodies[T];
  read(recordType: number): RawRecord;
  read(recordType: number): object {
    const decodeRecord = VARIABLE_RECORD_DECODERS.get(recordType);
    if (decodeRecord)
      return decodeRecord(this.reader, this.header) as RawRecord;
    return this.readFixedRecord(recordType);
  }

  private readFixedRecord(recordType: number): RawRecord {
    const record = this.fixedReader.read(recordType);
    if (!record)
      throw parserError("brdUnknownRecord", {
        detail: `0x${recordType.toString(16)}`,
      });
    if (recordType === 0x2d && this.header.version < 172)
      record.InstRef = record.InstRef16x;
    return record;
  }

  /** Initial indexing needs only the key and boundary. Variable records still validate payloads. */
  scanKey(recordType: number): number | undefined {
    const recordByteLength = this.scanByteLengths[recordType];
    if (!recordByteLength) {
      const key = this.read(recordType).Key;
      return typeof key === "number" ? key : undefined;
    }

    const bodyOffset = this.reader.offset;
    // The type byte was already consumed. Validate the entire remaining body
    // before reading its key, including records whose key happens to be zero.
    this.reader.skip(recordByteLength - 1);
    if (recordType === 0x35) return undefined;
    const keyOffset = bodyOffset + 3;
    return this.reader.view.getUint32(keyOffset, true);
  }
}
