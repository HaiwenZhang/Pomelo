import { test, expect } from "vitest";

import {
  indexKiCadBoard,
  kiCadItemText,
} from "../../src/lib/kicad/syntax/index";

const bytes = (text: string) => new TextEncoder().encode(text);
test("KiCad index keeps top-level spans despite quoted parentheses, escapes and comments", async () => {
  const source = bytes(
    '﻿(kicad_pcb\n (version 20260206)\n # (ignored)\n (net 1 "R\\\"(A)")\n (footprint "LED" (property "Reference" "D1") (fp_text user "(LED)"))\n)',
  );
  const index = await indexKiCadBoard(source);
  expect(index.version).toBe(20260206);
  expect(index.items.get("net")?.length).toBe(1);
  expect(index.items.get("footprint")?.length).toBe(1);
  expect(kiCadItemText(index, index.items.get("footprint")![0])).toMatch(
    /Reference/,
  );
});
test("KiCad index rejects truncated structure and extra root expressions", async () => {
  await expect(
    indexKiCadBoard(bytes('(kicad_pcb (version 1) (net 1 "x")')),
  ).rejects.toThrow(/未闭合/);
  await expect(
    indexKiCadBoard(bytes("(kicad_pcb (version 1))(kicad_pcb (version 2))")),
  ).rejects.toThrow(/多个根表达式/);
});
test("KiCad index respects pre-cancellation", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    indexKiCadBoard(bytes("(kicad_pcb (version 1))"), controller.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
});
