import { BoardSearchIndex } from "../board/search";
import { BoardTextStrokeBuilder } from "../text/board-text-stroke-builder";
import { StrokeFont } from "../text/stroke-font";
import { importBoard } from "./formats";
import type { BoardImporter, BoardLoader } from "./model";

/** Runs the same cancellable preparation for every source format. */
export function createBoardLoader(
  importer: BoardImporter = importBoard,
): BoardLoader {
  return async (source, signal, progress, encoding = "utf-8") => {
    signal.throwIfAborted();
    const report: typeof progress =
      progress &&
      ((update) => {
        if (!signal.aborted) progress(update);
      });
    const buffer = await source.arrayBuffer();
    signal.throwIfAborted();
    const { scene, metadata } = await importer(
      source.name,
      buffer,
      signal,
      report,
      encoding,
    );
    signal.throwIfAborted();
    report?.({ phase: "读取原始文字字形" });
    await StrokeFont.prepare(scene.texts, signal);
    const missing = new Set<string>();
    for (const text of scene.texts)
      for (const character of text.text)
        if (!BoardTextStrokeBuilder.supportsGlyph(character))
          missing.add(character);
    if (missing.size)
      scene.diagnostics.push(
        `原始文字缺少 ${missing.size} 种字形，暂用 ? 显示：${[...missing].slice(0, 16).join(" ")}`,
      );
    report?.({ phase: "构建搜索索引", fraction: 0.7 });
    const searchItems = await BoardSearchIndex.buildItemsAsync(scene, signal);
    signal.throwIfAborted();
    return {
      scene,
      searchItems,
      file: { name: source.name, size: source.size, ...metadata, encoding },
    };
  };
}

export const loadBoard = createBoardLoader();
