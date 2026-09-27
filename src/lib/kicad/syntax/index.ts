import { cooperative } from "../../cooperative";
export interface KiCadSpan {
  start: number;
  end: number;
}
export interface KiCadBoardIndex {
  version: number;
  items: Map<string, KiCadSpan[]>;
  bytes: Uint8Array;
  maxDepth: number;
}
const whitespace = (byte: number) =>
  byte === 32 || byte === 9 || byte === 10 || byte === 13;
const nameChar = (byte: number) =>
  byte > 32 && byte !== 40 && byte !== 41 && byte !== 34;
/** Index top-level KiCad board expressions without decoding or copying a large
 * board. Full object parsing can then work one span at a time. */
export class KiCadBoardIndexer {
  private readonly decoder = new TextDecoder("ascii", { fatal: true });
  constructor(private readonly bytes: Uint8Array) {}
  async read(signal?: AbortSignal): Promise<KiCadBoardIndex> {
    const { bytes } = this;
    signal?.throwIfAborted();
    const items = new Map<string, KiCadSpan[]>(),
      pause = cooperative(signal);
    let cursor = 0,
      depth = 0,
      maxDepth = 0,
      inside = false,
      escaped = false,
      comment = false,
      start = -1,
      tag = "",
      rootStart = -1,
      rootEnd = -1;
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) cursor = 3;
    for (; cursor < bytes.length; cursor++) {
      if ((cursor & 0xfffff) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const byte = bytes[cursor];
      if (comment) {
        if (byte === 10 || byte === 13) comment = false;
        continue;
      }
      if (inside) {
        if (escaped) escaped = false;
        else if (byte === 92) escaped = true;
        else if (byte === 34) inside = false;
        continue;
      }
      if (byte === 34) {
        inside = true;
        continue;
      }
      if (byte === 35 || byte === 59) {
        comment = true;
        continue;
      }
      if (byte === 40) {
        if (depth === 0) {
          if (rootStart !== -1) throw new Error("KiCad 文件包含多个根表达式");
          rootStart = cursor;
        }
        if (depth === 1) {
          start = cursor;
          let at = cursor + 1;
          while (at < bytes.length && whitespace(bytes[at])) at++;
          const begin = at;
          while (at < bytes.length && nameChar(bytes[at])) at++;
          if (at === begin)
            throw new Error(`KiCad 顶层对象缺少名称 @${cursor}`);
          tag = this.decoder.decode(bytes.subarray(begin, at));
        }
        depth++;
        maxDepth = Math.max(maxDepth, depth);
      } else if (byte === 41) {
        if (depth === 0) throw new Error(`KiCad 多余右括号 @${cursor}`);
        depth--;
        if (depth === 1) {
          if (start < 0) throw new Error("KiCad 顶层对象范围无效");
          const list = items.get(tag) ?? [];
          list.push({ start, end: cursor + 1 });
          items.set(tag, list);
          start = -1;
        }
        if (depth === 0) rootEnd = cursor + 1;
      } else if (depth === 0 && !whitespace(byte))
        throw new Error(`KiCad 根表达式外含额外内容 @${cursor}`);
    }
    if (inside || depth !== 0 || rootStart < 0 || rootEnd < 0)
      throw new Error("KiCad 表达式未闭合");
    const root = bytes.subarray(rootStart, Math.min(rootEnd, rootStart + 32));
    if (!/^\(kicad_pcb(?:\s|\()/i.test(this.decoder.decode(root)))
      throw new Error("KiCad 根对象不是 kicad_pcb");
    const versionSpans = items.get("version");
    if (versionSpans?.length !== 1) throw new Error("KiCad 版本字段无效");
    const versionText = this.decoder.decode(
      bytes.subarray(versionSpans[0].start, versionSpans[0].end),
    );
    const match = /^\(version\s+(\d+)\)$/.exec(versionText.trim());
    if (!match) throw new Error("KiCad 版本号无效");
    return { version: Number(match[1]), items, bytes, maxDepth };
  }
}
/** Compatibility entry point; parsing state belongs to KiCadBoardIndexer. */
export async function indexKiCadBoard(
  bytes: Uint8Array,
  signal?: AbortSignal,
): Promise<KiCadBoardIndex> {
  return new KiCadBoardIndexer(bytes).read(signal);
}
export function kiCadItemText(index: KiCadBoardIndex, span: KiCadSpan) {
  return new TextDecoder("utf-8", { fatal: true }).decode(
    index.bytes.subarray(span.start, span.end),
  );
}
