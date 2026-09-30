import core from "./generated/core.json";
import manifest from "./generated/manifest.json";
import { cooperative } from "../cooperative";
import { FontMetrics, type MsdfMetadata } from "../render/font-metrics";

export const FONT_ASSET_PATH = "fonts/source-han-sans/";
export type MsdfBlockLoader = (
  block: number,
  signal?: AbortSignal,
) => Promise<MsdfMetadata>;

/** CPU metrics are shared across boards; GPU textures belong to each renderer.
 * English stays in the core atlas. Only blocks present in the text are fetched. */
export class MsdfFont {
  static readonly font = FontMetrics.fromMsdf(core, 0);
  private static readonly available = new Set<number>(manifest.blocks);
  private static readonly loaded = new Set<number>();

  static glyph(ch: string) {
    return MsdfFont.font.glyphs[ch];
  }

  private static readonly loadBlock: MsdfBlockLoader = async (
    block,
    signal,
  ) => {
    const base = import.meta.env?.BASE_URL ?? "/";
    const response = await fetch(
      `${base}${FONT_ASSET_PATH}${block.toString(16).padStart(2, "0")}.json`,
      { signal },
    );
    if (!response.ok) throw Error("字体度量加载失败");
    return response.json();
  };

  static async prepare(
    texts: Iterable<{ text: string }>,
    signal?: AbortSignal,
    loader: MsdfBlockLoader = MsdfFont.loadBlock,
  ) {
    signal?.throwIfAborted();
    const needed = new Set<number>(),
      missing = new Set<string>();
    const checkpoint = cooperative(signal);
    let work = 0;
    for (const { text } of texts)
      for (const ch of text) {
        const block = ch.codePointAt(0)! >>> 8;
        if (!MsdfFont.glyph(ch) && !["\n", "\r", "\t"].includes(ch)) {
          missing.add(ch);
          if (MsdfFont.available.has(block) && !MsdfFont.loaded.has(block))
            needed.add(block);
        }
        if ((++work & 4095) === 0) {
          const pause = checkpoint();
          if (pause) await pause;
        }
      }
    for (const block of needed) {
      signal?.throwIfAborted();
      if (MsdfFont.loaded.has(block)) continue;
      const data = await loader(block, signal);
      signal?.throwIfAborted();
      if (
        !data?.atlas ||
        data.atlas.size !== core.atlas.size ||
        data.atlas.distanceRange !== core.atlas.distanceRange ||
        !Number.isFinite(data.atlas.width) ||
        data.atlas.width <= 0 ||
        !Number.isFinite(data.atlas.height) ||
        data.atlas.height <= 0 ||
        !Array.isArray(data.glyphs) ||
        data.glyphs.some(
          (g) =>
            !Number.isInteger(g.unicode) ||
            g.unicode >>> 8 !== block ||
            !Number.isFinite(g.advance) ||
            [g.planeBounds, g.atlasBounds].some(
              (b) => b && !Object.values(b).every(Number.isFinite),
            ),
        )
      )
        throw Error("MSDF 字体数据无效");
      const page = FontMetrics.fromMsdf(data, block + 1);
      Object.assign(MsdfFont.font.glyphs, page.glyphs);
      FontMetrics.invalidate(MsdfFont.font);
      MsdfFont.loaded.add(block);
    }
    signal?.throwIfAborted();
    for (const ch of missing) if (MsdfFont.glyph(ch)) missing.delete(ch);
    return missing;
  }
}
