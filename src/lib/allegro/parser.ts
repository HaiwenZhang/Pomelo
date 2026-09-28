import { AllegroHeaderReader } from "./binary/header";
import { Reader } from "./binary/reader";
import { AllegroRecordReader } from "./binary/record-reader";
import { OffsetList } from "./binary/offset-list";
import { AllegroStringTableReader } from "./binary/string-table";
import type { BrdTextEncoding } from "./binary/text-decoder";
import { BrdTextDecoder } from "./binary/text-decoder";
import { BrdDatabase } from "./database";
import { parserError, parserMessage } from "../parser-error";
export interface ParseProgress {
  phase: "strings" | "objects";
  fraction: number;
  count: number;
}
export class AllegroParser {
  constructor(
    readonly buffer: ArrayBuffer,
    readonly encoding: BrdTextEncoding = "utf-8",
  ) {}
  async parse(signal?: AbortSignal, progress?: (p: ParseProgress) => void) {
    const buffer = this.buffer;
    const encoding = this.encoding;
    const header = new AllegroHeaderReader(buffer).read();
    const textDecoder = new BrdTextDecoder(encoding);
    const table = await new AllegroStringTableReader(
      buffer,
      header,
      textDecoder,
    ).read(signal, (fraction) =>
      progress?.({ phase: "strings", fraction, count: 0 }),
    );
    const db = new BrdDatabase(buffer, header, table.strings, textDecoder),
      r = new Reader(buffer, textDecoder);
    const records = new AllegroRecordReader(r, header);
    r.seek(table.objectOffset);
    let deadline = performance.now() + 10;
    while (r.offset < buffer.byteLength) {
      signal?.throwIfAborted();
      const offset = r.offset;
      if (offset % 4)
        throw parserError("brdUnalignedRecord", {
          detail: `0x${offset.toString(16)}`,
        });
      const type = r.recordType(header.version);
      if (type === 0) {
        // V18 permits zero-filled gaps between record groups. Only resume at
        // an aligned nonzero type; never scan past unknown/nonzero payloads.
        if (header.version >= 180) {
          const bytes = new Uint8Array(buffer);
          let next = r.offset;
          while (next < bytes.length && bytes[next] === 0) {
            next++;
            if ((next & 0xfffff) === 0) {
              signal?.throwIfAborted();
              if (performance.now() >= deadline) {
                progress?.({
                  phase: "objects",
                  fraction: next / bytes.length,
                  count: db.count,
                });
                await new Promise((resolve) => setTimeout(resolve, 0));
                signal?.throwIfAborted();
                deadline = performance.now() + 10;
              }
            }
          }
          if (next < bytes.length && next % 4 === 0 && bytes[next] <= 0x3e) {
            r.seek(next);
            continue;
          }
        }
        db.endOffset = offset;
        break;
      }
      try {
        const key = records.scanKey(type);
        if (key && !db.offsets.add(key, offset))
          throw parserError("brdDuplicateObject", { detail: key });
        let group = db.byType.get(type);
        if (!group) {
          group = new OffsetList();
          db.byType.set(type, group);
        }
        group.push(offset);
        db.count++;
      } catch (error) {
        const context = parserMessage("brdRecordFailed", {
          detail: db.count,
          value: `0x${type.toString(16)}`,
          extra: `0x${offset.toString(16)}`,
        });
        throw new Error(
          `${context}: ${error instanceof Error ? error.message : String(error)}`,
          {
            cause: error,
          },
        );
      }
      if ((db.count & 255) === 0 && performance.now() >= deadline) {
        progress?.({
          phase: "objects",
          fraction: r.offset / buffer.byteLength,
          count: db.count,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));
        deadline = performance.now() + 10;
      }
    }
    if (!db.endOffset) db.endOffset = r.offset;
    progress?.({ phase: "objects", fraction: 1, count: db.count });
    return db;
  }
}
