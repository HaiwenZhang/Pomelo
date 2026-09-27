import type { BrdHeader } from "./header";
import { Reader } from "./reader";
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
    for (let i = 0; i < header.stringCount; i++) {
      signal?.throwIfAborted();
      const id = r.u32();
      strings.set(id, r.cstring());
      if (performance.now() >= deadline) {
        progress?.(i / header.stringCount);
        await new Promise((resolve) => setTimeout(resolve, 0));
        deadline = performance.now() + 10;
      }
    }
    progress?.(1);
    return { strings, objectOffset: r.offset };
  }
}
