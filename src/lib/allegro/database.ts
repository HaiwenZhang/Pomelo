import type { BrdHeader } from "./binary/header";
import { OffsetIndex } from "./binary/offset-index";
import type { OffsetList } from "./binary/offset-list";
import type {
  AllegroRecord,
  IndexedRecord,
  KnownRecordType,
  OpaqueRecord,
} from "./binary/record-types";
import { Reader } from "./binary/reader";
import { AllegroRecordReader } from "./binary/record-reader";
import { BrdTextDecoder } from "./binary/text-decoder";
export class BrdDatabase {
  readonly offsets = new OffsetIndex();
  readonly byType = new Map<number, OffsetList | number[]>();
  count = 0;
  endOffset = 0;
  private readonly reader: Reader;
  private readonly decoder: AllegroRecordReader;
  constructor(
    readonly buffer: ArrayBuffer,
    readonly header: BrdHeader,
    readonly strings: Map<number, string>,
    readonly textDecoder = new BrdTextDecoder(),
  ) {
    this.reader = new Reader(buffer, textDecoder);
    this.decoder = new AllegroRecordReader(this.reader, header);
  }
  at(offset: number): OpaqueRecord {
    // Decoding is synchronous; iterators yield only after a complete record.
    // Reuse cursor machinery, while returning fresh independently owned values.
    const reader = this.reader;
    reader.seek(offset);
    const type = reader.recordType(this.header.version);
    const record = this.decoder.read(type);
    record.type = type;
    record.offset = offset;
    return record as OpaqueRecord;
  }
  get<T extends KnownRecordType>(
    key: number | undefined,
    expected: T,
  ): AllegroRecord<T> | undefined;
  get(key: number | undefined): IndexedRecord | undefined;
  get(
    key: number | undefined,
    expected?: KnownRecordType,
  ): IndexedRecord | AllegroRecord | undefined {
    if (key === undefined) return undefined;
    const offset = this.offsets.get(key);
    if (offset === undefined) return undefined;
    const record = this.at(offset);
    return expected !== undefined && record.type !== expected
      ? undefined
      : (record as IndexedRecord);
  }
  records<T extends KnownRecordType>(
    type: T,
  ): Generator<AllegroRecord<T>, void, unknown>;
  records(type: number): Generator<OpaqueRecord, void, unknown>;
  *records(
    type: number,
  ): Generator<OpaqueRecord | AllegroRecord, void, unknown> {
    for (const offset of this.byType.get(type) ?? []) yield this.at(offset);
  }
}
