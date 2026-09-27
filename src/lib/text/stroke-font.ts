import { strokeFont } from "./stroke-font-data";
import { strokeFontBlocks } from "./stroke-font-blocks";
import { cooperative } from "../cooperative";

export type StrokeBlockLoader = (
  block: number,
  signal?: AbortSignal,
) => Promise<Record<string, string>>;
export class StrokeFont {
  private static readonly available = new Set<number>(strokeFontBlocks);
  private static readonly extended: Record<string, string> =
    Object.create(null);
  private static readonly loaded = new Set<number>();
  static glyph(ch: string): string | undefined {
    return strokeFont[ch] ?? StrokeFont.extended[ch];
  }
  private static readonly loadBlock: StrokeBlockLoader = async (
    block,
    signal,
  ) => {
    const base = import.meta.env?.BASE_URL ?? "/";
    const response = await fetch(
      `${base}fonts/stroke/${block.toString(16).padStart(2, "0")}.json`,
      { signal },
    );
    if (!response.ok)
      throw Error(
        `无法读取扩展笔画字体 ${block.toString(16)}：HTTP ${response.status}`,
      );
    return response.json();
  };

  /** Load only Unicode blocks actually used by stored board text. Core Latin/
   * Greek boards make no requests. Everything stays on the main thread and
   * cancellation interrupts both the scan and fetch; failed blocks can retry. */
  static async prepare(
    texts: Iterable<{ text: string }>,
    signal?: AbortSignal,
    loader: StrokeBlockLoader = StrokeFont.loadBlock,
  ) {
    signal?.throwIfAborted();
    const needed = new Set<number>(),
      checkpoint = cooperative(signal);
    let work = 0;
    for (const { text } of texts)
      for (const ch of text) {
        const block = ch.codePointAt(0)! >>> 8;
        if (
          StrokeFont.glyph(ch) === undefined &&
          StrokeFont.available.has(block) &&
          !StrokeFont.loaded.has(block)
        )
          needed.add(block);
        if ((++work & 4095) === 0) {
          const pause = checkpoint();
          if (pause) await pause;
        }
      }
    for (const block of needed) {
      signal?.throwIfAborted();
      if (StrokeFont.loaded.has(block)) continue;
      const data = await loader(block, signal);
      signal?.throwIfAborted();
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw Error("扩展笔画字体数据无效");
      for (const [ch, path] of Object.entries(data)) {
        if (
          [...ch].length !== 1 ||
          ch.codePointAt(0)! >>> 8 !== block ||
          typeof path !== "string" ||
          path.length < 2 ||
          path.length % 2 !== 0
        )
          throw Error("扩展笔画字体字形无效");
      }
      Object.assign(StrokeFont.extended, data);
      StrokeFont.loaded.add(block);
    }
    signal?.throwIfAborted();
  }
}
