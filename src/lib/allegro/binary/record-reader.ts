import type { BrdHeader } from "./header";
import { AllegroFixedLayoutReader } from "./layouts";
import type { Raw as RawRecord, Reader } from "./reader";
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

type VariableRecordDecoder = (reader: Reader, header: BrdHeader) => RawRecord;

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

/** Reads record bodies after the caller consumes the type byte. */
export class AllegroRecordReader {
  constructor(
    readonly reader: Reader,
    readonly header: BrdHeader,
  ) {}

  read(recordType: number): RawRecord {
    const decodeRecord = VARIABLE_RECORD_DECODERS.get(recordType);
    if (decodeRecord) return decodeRecord(this.reader, this.header);
    return this.readFixedRecord(recordType);
  }

  private readFixedRecord(recordType: number): RawRecord {
    const record = new AllegroFixedLayoutReader(
      this.reader,
      this.header.version,
    ).read(recordType);
    if (!record) throw new Error(`未知记录类型 0x${recordType.toString(16)}`);
    if (recordType === 0x2d && this.header.version < 172)
      record.InstRef = record.InstRef16x;
    return record;
  }

  /** Initial indexing needs only the key and boundary. Variable records still validate payloads. */
  scanKey(recordType: number): number | undefined {
    const recordByteLength = getScannableRecordByteLength(
      recordType,
      this.header.version,
    );
    if (recordByteLength === undefined) return this.read(recordType).Key;

    const bodyOffset = this.reader.offset;
    // The type byte was already consumed. Validate the entire remaining body
    // before reading its key, including records whose key happens to be zero.
    this.reader.skip(recordByteLength - 1);
    const keyOffset = bodyOffset + 3;
    return this.reader.view.getUint32(keyOffset, true);
  }
}
