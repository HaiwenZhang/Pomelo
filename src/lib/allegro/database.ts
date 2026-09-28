import type { BrdHeader } from "./binary/header";
import { OffsetIndex } from "./binary/offset-index";
import type { OffsetList } from "./binary/offset-list";
import type { Raw } from "./binary/reader";
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
  at(offset: number) {
    // Decoding is synchronous; iterators yield only after a complete record.
    // Reuse cursor machinery, while returning fresh independently owned values.
    const reader = this.reader;
    reader.seek(offset);
    const type = reader.recordType(this.header.version);
    const record = this.decoder.read(type) as Raw;
    record.type = type;
    record.offset = offset;
    return record;
  }
  get(key: number) {
    const offset = this.offsets.get(key);
    return offset === undefined ? undefined : this.at(offset);
  }
  *records(type: number) {
    for (const offset of this.byType.get(type) ?? []) yield this.at(offset);
  }
}
