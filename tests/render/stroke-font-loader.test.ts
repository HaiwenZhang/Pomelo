import { test, expect } from "vitest";
import type { BoardText } from "../../src/lib/board/model";

import { readFile } from "node:fs/promises";
import {
  StrokeFont,
  type StrokeBlockLoader,
} from "../../src/lib/text/stroke-font";
import { BoardTextStrokeBuilder } from "../../src/lib/text/board-text-stroke-builder";

const fromFile: StrokeBlockLoader = async (block) =>
  JSON.parse(
    await readFile(
      new URL(
        `../../public/fonts/stroke/${block.toString(16).padStart(2, "0")}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
test("Latin-only boards need no font request; unsupported replacement characters remain diagnostic", async () => {
  await StrokeFont.prepare(
    [{ text: "i.MX 8M MINI Ωµ°\n" }],
    undefined,
    async () => {
      throw Error("Unexpected request");
    },
  );
  expect(BoardTextStrokeBuilder.supportsGlyph("\ufffd")).toBe(false);
  expect(BoardTextStrokeBuilder.supportsGlyph("\u0378")).toBe(false);
});
test("real diameter and Chinese strokes load only their three blocks and keep original text geometry", async () => {
  const requests: number[] = [];
  await StrokeFont.prepare(
    [{ text: "⌀ 过孔 过孔" }],
    undefined,
    async (block, signal) => {
      requests.push(block);
      return fromFile(block, signal);
    },
  );
  expect(requests).toStrictEqual([0x23, 0x8f, 0x5b]);
  // Independently read from the upstream array at U+2300 / U+8FC7 / U+5B54.
  expect(StrokeFont.glyph("⌀")).toBe("E_PKTKXMZQZUXYT[P[LYJUJQLMPK RZKJ[");
  expect(StrokeFont.glyph("过")).toBe(
    "PoTDXH RUXR[ RZIkI R\\M_P`R RfCfXaX RRNWNWWYY\\Zl[",
  );
  expect(StrokeFont.glyph("孔")).toBe(
    "PoU[Y[ RYJY[ R`NRP Rb[k[ RcDcZ RlVk[ RRE_EZJ",
  );
  const text: BoardText = {
    id: 1,
    layer: 0,
    classId: 6,
    subclass: 0,
    text: "过孔",
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
  const original = BoardTextStrokeBuilder.build(text),
    reflected = BoardTextStrokeBuilder.build({ ...text, mirrored: true });
  expect(original.length).toBe(20); // 12 line segments in 过, 8 in 孔.
  expect(original).not.toStrictEqual(
    BoardTextStrokeBuilder.build({ ...text, text: "??" }),
  );
  for (let i = 0; i < original.length; i++) {
    expect(Math.abs(reflected[i].a[0] + original[i].a[0]) < 1e-12).toBeTruthy();
    expect(reflected[i].a[1]).toBe(original[i].a[1]);
  }
  await StrokeFont.prepare([{ text: "⌀过孔" }], undefined, async () => {
    throw Error("Already cached");
  });
  expect(BoardTextStrokeBuilder.supportsGlyph("\ufffd")).toBe(false);
});
test("failed and cancelled font loads do not publish success and can retry", async () => {
  const value = [{ text: "中" }],
    job = new AbortController();
  await expect(
    Promise.resolve().then(() =>
      StrokeFont.prepare(value, job.signal, async () => {
        job.abort();
        return { 中: "RR" };
      }),
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(BoardTextStrokeBuilder.supportsGlyph("中")).toBe(false);
  await expect(
    Promise.resolve().then(() =>
      StrokeFont.prepare(value, undefined, async () => {
        throw Error("Offline");
      }),
    ),
  ).rejects.toThrow(/Offline/);
  expect(BoardTextStrokeBuilder.supportsGlyph("中")).toBe(false);
  await StrokeFont.prepare(value, undefined, fromFile);
  expect(BoardTextStrokeBuilder.supportsGlyph("中")).toBe(true);
});
