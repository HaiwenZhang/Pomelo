import { BrdTextDecoder } from "./text-decoder";
import { parserError } from "../../parser-error";
export type Raw = Record<string, any>;
export class Reader {
  offset = 0;
  readonly view: DataView;
  readonly buffer: ArrayBuffer;
  constructor(
    buffer: ArrayBuffer,
    readonly textDecoder = new BrdTextDecoder(),
  ) {
    this.buffer = buffer;
    this.view = new DataView(buffer);
  }
  ensure(bytes: number) {
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      this.offset + bytes > this.buffer.byteLength
    )
      throw parserError("brdOutOfBounds", {
        detail: `0x${this.offset.toString(16)}`,
        value: bytes,
      });
  }
  skip(bytes: number) {
    this.ensure(bytes);
    this.offset += bytes;
  }
  seek(offset: number) {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > this.buffer.byteLength
    )
      throw parserError("brdInvalidOffset");
    this.offset = offset;
  }
  private numbers(
    size: 1 | 2 | 4,
    count: number | undefined,
    signed = false,
  ): number | number[] {
    if (count !== undefined && (!Number.isSafeInteger(count) || count < 0))
      throw parserError("brdInvalidArrayCount", { detail: count });
    this.ensure(size * (count ?? 1));
    const one = () => {
      const p = this.offset;
      this.offset += size;
      return size === 1
        ? this.view.getUint8(p)
        : size === 2
          ? signed
            ? this.view.getInt16(p, true)
            : this.view.getUint16(p, true)
          : signed
            ? this.view.getInt32(p, true)
            : this.view.getUint32(p, true);
    };
    return count === undefined ? one() : Array.from({ length: count }, one);
  }
  u8(): number;
  u8(count: number): number[];
  u8(count?: number): number | number[] {
    return this.numbers(1, count);
  }
  u16(): number;
  u16(count: number): number[];
  u16(count?: number): number | number[] {
    return this.numbers(2, count);
  }
  i16(): number;
  i16(count: number): number[];
  i16(count?: number): number | number[] {
    return this.numbers(2, count, true);
  }
  u32(): number;
  u32(count: number): number[];
  u32(count?: number): number | number[] {
    return this.numbers(4, count);
  }
  i32(): number;
  i32(count: number): number[];
  i32(count?: number): number | number[] {
    return this.numbers(4, count, true);
  }
  float(): number {
    const high = this.u32(),
      low = this.u32();
    const v = new DataView(new ArrayBuffer(8));
    v.setUint32(0, high);
    v.setUint32(4, low);
    return v.getFloat64(0);
  }
  str(length: number): string {
    this.ensure(length);
    const bytes = new Uint8Array(this.buffer, this.offset, length);
    const end = bytes.indexOf(0);
    const result = this.textDecoder.decode(
      end < 0 ? bytes : bytes.subarray(0, end),
      this.offset,
    );
    this.skip(length);
    this.skip((4 - (this.offset % 4)) % 4);
    return result;
  }
  /** Opaque fixed-size payload, including embedded NULs; shares the source buffer. */
  bytes(length: number): Uint8Array {
    this.ensure(length);
    const result = new Uint8Array(this.buffer, this.offset, length);
    this.skip(length);
    this.skip((4 - (this.offset % 4)) % 4);
    return result;
  }
  cstring(): string {
    const start = this.offset;
    while (this.u8() !== 0) {
      /* bounded by u8 */
    }
    const length = this.offset - start;
    const result = this.textDecoder.decode(
      new Uint8Array(this.buffer, start, length - 1),
      start,
    );
    this.skip((4 - (this.offset % 4)) % 4);
    return result;
  }
}
