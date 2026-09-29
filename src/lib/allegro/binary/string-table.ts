import type { BrdHeader } from "./header";
import { Reader } from "./reader";
import { parserError } from "../../parser-error";
import { BrdTextDecoder } from "./text-decoder";
export class AllegroStringTableReader {
  constructor(
    readonly buffer: ArrayBuffer,
    readonly header: BrdHeader,
    readonly textDecoder = new BrdTextDecoder(),
  ) {}
  async read(signal?: AbortSignal, progress?: (fraction: number) => void) {
    const buffer = this.buffer;
    const header = this.header;
    const textDecoder = this.textDecoder;
    const r = new Reader(buffer, textDecoder);
    r.seek(0x1200);
    const strings = new Map<number, string>();
    let deadline = performance.now() + 10;
    let lastClockOffset = r.offset;
    for (let i = 0; i < header.stringCount; i++) {
      signal?.throwIfAborted();
      const id = r.u32();
      if (strings.has(id))
        throw parserError("brdDuplicateStringId", { detail: id });
      strings.set(id, r.cstring());
      // Check the clock in batches; long strings also trigger a byte budget.
      if ((i & 255) === 255 || r.offset - lastClockOffset >= 64 * 1024) {
        lastClockOffset = r.offset;
        if (performance.now() >= deadline) {
          progress?.(i / header.stringCount);
          await new Promise((resolve) => setTimeout(resolve, 0));
          deadline = performance.now() + 10;
        }
      }
    }
    progress?.(1);
    return { strings, objectOffset: r.offset };
  }
}

/** Resolve a version-specific string reference without treating a missing ID as zero. */
export function lookupString(
  strings: ReadonlyMap<number, string>,
  id: number | undefined,
) {
  return id === undefined ? undefined : strings.get(id);
}
