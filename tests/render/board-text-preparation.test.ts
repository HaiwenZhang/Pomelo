import { expect, test, vi } from "vitest";
import type { BoardScene } from "../../src/lib/board/model";
import { prepareBoardText } from "../../src/lib/text/board-text-preparation";
import { MsdfFont } from "../../src/lib/text/msdf-font";

test("a prepared scene reuses font scanning and retains one missing-glyph diagnostic", async () => {
  const prepare = vi.spyOn(MsdfFont, "prepare");
  const scene = {
    texts: [{ text: "ASCII 😀😀" }],
    diagnostics: [],
  } as unknown as BoardScene;
  try {
    await prepareBoardText(scene);
    await prepareBoardText(scene);
    expect(prepare).toHaveBeenCalledOnce();
    expect(scene.diagnostics).toEqual([
      "原始文字缺少 1 种字形，暂用 ? 显示：😀",
    ]);
    const controller = new AbortController();
    controller.abort();
    await expect(
      prepareBoardText(scene, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    prepare.mockRestore();
  }
});

test("failed preparation can retry without caching a partially prepared scene", async () => {
  const prepare = vi
    .spyOn(MsdfFont, "prepare")
    .mockRejectedValueOnce(Error("offline"));
  const scene = {
    texts: [{ text: "ASCII" }],
    diagnostics: [],
  } as unknown as BoardScene;
  try {
    await expect(prepareBoardText(scene)).rejects.toThrow("offline");
    await prepareBoardText(scene);
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(scene.diagnostics).toEqual([]);
  } finally {
    prepare.mockRestore();
  }
});
