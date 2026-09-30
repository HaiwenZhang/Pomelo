import type { BoardScene } from "../board/model";
import { MsdfFont } from "./msdf-font";

const prepared = new WeakSet<BoardScene>();

/** Import and standalone render preparation share the font stage for an immutable scene.
 * Only successful scans are cached; cancellation and failed loads remain retryable. */
export async function prepareBoardText(
  scene: BoardScene,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  if (prepared.has(scene)) return;
  const missing = await MsdfFont.prepare(scene.texts, signal);
  // Net names are also rendered by the shared MSDF atlas.
  if (scene.nets?.size)
    await MsdfFont.prepare(
      (function* () {
        for (const text of scene.nets?.values() ?? []) yield { text };
      })(),
      signal,
    );
  signal?.throwIfAborted();
  if (missing.size) {
    const message = `原始文字缺少 ${missing.size} 种字形，暂用 ? 显示：${[...missing].slice(0, 16).join(" ")}`;
    if (!scene.diagnostics.includes(message)) scene.diagnostics.push(message);
  }
  prepared.add(scene);
}
