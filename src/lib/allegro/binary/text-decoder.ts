/** Legacy BRDs can contain locale code pages. Encoding is explicit: byte-valid
 * GBK and Shift-JIS strings can both decode successfully to different words. */
export const brdTextEncodings = [
  "utf-8",
  "gbk",
  "shift_jis",
  "big5",
  "windows-1252",
] as const;
export type BrdTextEncoding = (typeof brdTextEncodings)[number];
export const brdTextEncodingNames: Record<BrdTextEncoding, string> = {
  "utf-8": "UTF-8",
  gbk: "简体中文（GBK）",
  shift_jis: "日文（Shift-JIS）",
  big5: "繁体中文（Big5）",
  "windows-1252": "西欧（Windows-1252）",
};
export interface TextDecodingIssue {
  offset: number;
  length: number;
  encoding: BrdTextEncoding;
}
export class BrdTextDecoder {
  readonly issues = new Map<number, TextDecodingIssue>();
  private readonly strict: TextDecoder;
  private readonly replacement: TextDecoder;
  constructor(readonly encoding: BrdTextEncoding = "utf-8") {
    this.strict = new TextDecoder(encoding, { fatal: true });
    this.replacement = new TextDecoder(encoding);
  }
  decode(bytes: Uint8Array, offset: number): string {
    try {
      return this.strict.decode(bytes);
    } catch {
      this.issues.set(offset, {
        offset,
        length: bytes.length,
        encoding: this.encoding,
      });
      return this.replacement.decode(bytes);
    }
  }
}
