import type { BrdHeader } from "./binary/header";
import { OffsetIndex } from "./binary/offset-index";
import type { Raw } from "./binary/reader";
import { Reader } from "./binary/reader";
import { AllegroRecordReader } from "./binary/record-reader";
import { BrdTextDecoder } from "./binary/text-decoder";
export class BrdDatabase {
  readonly offsets = new OffsetIndex();
  readonly byType = new Map<number, number[]>();
  count = 0;
  endOffset = 0;
  constructor(
    readonly buffer: ArrayBuffer,
    readonly header: BrdHeader,
    readonly strings: Map<number, string>,
    readonly textDecoder = new BrdTextDecoder(),
  ) {}
  at(offset: number) {
    const reader = new Reader(this.buffer, this.textDecoder);
    reader.seek(offset);
    const type = reader.u8();
    return {
      ...new AllegroRecordReader(reader, this.header).read(type),
      type,
      offset,
    } as Raw;
  }
  get(key: number) {
    const offset = this.offsets.get(key);
    return offset === undefined ? undefined : this.at(offset);
  }
  *records(type: number) {
    for (const offset of this.byType.get(type) ?? []) yield this.at(offset);
  }
}
