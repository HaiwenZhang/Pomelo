import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { MsdfFont, type MsdfBlockLoader } from "../../src/lib/text/msdf-font";
import { BoardTextGlyphBuilder } from "../../src/lib/text/board-text-glyph-builder";
import { FontMetrics } from "../../src/lib/render/font-metrics";
import type { BoardText } from "../../src/lib/board/model";
import { buildBoardTextBatches } from "../../src/lib/render/board-text-batch-builder";
import type { BoardScene } from "../../src/lib/board/model";

const fromFile: MsdfBlockLoader = async (block) =>
  JSON.parse(
    await readFile(
      new URL(
        `../../public/fonts/source-han-sans/${block.toString(16).padStart(2, "0")}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );

test("English and engineering symbols need no extended font request", async () => {
  expect(
    await MsdfFont.prepare(
      [{ text: "i.MX 8M MINI Ωµ° ±×÷\n" }],
      undefined,
      async () => {
        throw Error("Unexpected request");
      },
    ),
  ).toEqual(new Set());
  expect(MsdfFont.glyph("简")).toBeUndefined();
  expect(MsdfFont.glyph("\ufffd")).toBeUndefined();
});

test("Chinese requests only used blocks, caches pages and preserves mixed-text drawing order", async () => {
  const requests: number[] = [];
  const before = FontMetrics.advance(MsdfFont.font, "过");
  expect(
    await MsdfFont.prepare(
      [{ text: "A过孔A过孔😀" }],
      undefined,
      async (block, signal) => {
        requests.push(block);
        return fromFile(block, signal);
      },
    ),
  ).toEqual(new Set(["😀"]));
  expect(requests).toEqual([0x8f, 0x5b]);
  expect(MsdfFont.glyph("过")?.page).toBe(0x90);
  expect(MsdfFont.glyph("孔")?.page).toBe(0x5c);
  expect(FontMetrics.advance(MsdfFont.font, "过")).toBe(1);
  expect(before).not.toBe(1); // Missing-glyph width cache must be invalidated.
  await MsdfFont.prepare([{ text: "过孔" }], undefined, async () => {
    throw Error("Already cached");
  });
  const text: BoardText = {
    id: 1,
    layer: 0,
    classId: 6,
    subclass: 0,
    text: "A过孔A",
    at: [0, 0],
    height: 1,
    width: 1,
    spacing: 0.2,
    lineSpacing: 1.5,
    strokeWidth: 0.03,
    angle: 0,
    mirrored: false,
    align: "left",
    fontIndex: 1,
  };
  expect(BoardTextGlyphBuilder.build(text).map((g) => g.page)).toEqual([
    0, 0x90, 0x5c, 0,
  ]);
  const scene = {
    texts: [text],
    layers: [{ id: 0, color: "#ffffff" }],
    drawingLayers: [],
    bounds: { minX: 0, minY: 0, maxX: 4, maxY: 2 },
  } as unknown as BoardScene;
  expect(
    [...buildBoardTextBatches(scene)].filter((b) => !!b).map((b) => b.msdf),
  ).toEqual([0, 0x90, 0x5c, 0]);
});

test("failed, cancelled and invalid metrics do not publish a page and remain retryable", async () => {
  const texts = [{ text: "中" }],
    controller = new AbortController();
  await expect(
    MsdfFont.prepare(texts, controller.signal, async (block) => {
      const data = await fromFile(block);
      controller.abort();
      return data;
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(MsdfFont.glyph("中")).toBeUndefined();
  await expect(
    MsdfFont.prepare(texts, undefined, async () => {
      throw Error("Offline");
    }),
  ).rejects.toThrow("Offline");
  await expect(
    MsdfFont.prepare(texts, undefined, async (block) => {
      const data = await fromFile(block);
      data.glyphs[0].unicode = 65;
      return data;
    }),
  ).rejects.toThrow("MSDF 字体数据无效");
  expect(MsdfFont.glyph("中")).toBeUndefined();
  await MsdfFont.prepare(texts, undefined, fromFile);
  expect(MsdfFont.glyph("中")?.page).toBe(0x4f);
});
