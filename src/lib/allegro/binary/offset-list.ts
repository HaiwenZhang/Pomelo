import { parserError } from "../../parser-error";

type OffsetPage = Uint32Array | Float64Array;
const MAX_PAGE_LENGTH = 4096;
const MAX_UINT32 = 0xffffffff;

/** Append-only record offsets, with bounded growth and no boxed-number array. */
export class OffsetList implements Iterable<number> {
  private readonly pages: OffsetPage[] = [];
  private tailLength = 0;
  private count = 0;

  get length(): number {
    return this.count;
  }

  get storageBytes(): number {
    return this.pages.reduce((bytes, page) => bytes + page.byteLength, 0);
  }

  push(offset: number): void {
    if (!Number.isSafeInteger(offset) || offset < 0)
      throw parserError("brdInvalidRecordOffset");
    let page = this.pages[this.pages.length - 1];
    if (!page || this.tailLength === page.length) {
      if (page && page.length < MAX_PAGE_LENGTH) {
        const grown =
          page instanceof Uint32Array
            ? new Uint32Array(page.length * 2)
            : new Float64Array(page.length * 2);
        grown.set(page);
        this.pages[this.pages.length - 1] = page = grown;
      } else {
        page = new Uint32Array(page ? MAX_PAGE_LENGTH : 32);
        this.pages.push(page);
        this.tailLength = 0;
      }
    }
    // Unusual >4 GiB inputs must retain exact offsets, just like OffsetIndex.
    if (offset > MAX_UINT32 && page instanceof Uint32Array) {
      page = new Float64Array(page);
      this.pages[this.pages.length - 1] = page;
    }
    page[this.tailLength++] = offset;
    this.count++;
  }

  *[Symbol.iterator](): IterableIterator<number> {
    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      const length =
        i === this.pages.length - 1 ? this.tailLength : page.length;
      for (let j = 0; j < length; j++) yield page[j];
    }
  }
}
