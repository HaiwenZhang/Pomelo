import { test, expect } from "vitest";

import { readPadsPadstacks } from "../../src/lib/pads/binary/padstack";
import { PADS_BASIC_TO_MM } from "../../src/lib/pads/binary/metadata";
import type { PadsContainer } from "../../src/lib/pads/binary/container";
function fixture(): PadsContainer {
  const view = new DataView(new ArrayBuffer(512)),
    sections = Array.from({ length: 75 }, (_, index) => ({
      index,
      count: 0,
      declaredBytes: 0,
      offset: 0,
      bytes: 0,
      records: 0,
    }));
  Object.assign(sections[4], { count: 3, declaredBytes: 192, offset: 128 });
  Object.assign(sections[5], { count: 2, declaredBytes: 48 });
  view.setUint8(156, 254);
  view.setUint8(157, 1);
  view.setInt32(128, 381000, true);
  view.setInt32(132, 190500, true);
  view.setUint8(158, 1);
  view.setUint32(164, 8, true);
  view.setInt32(172, 762000, true);
  view.setInt32(176, 90 * 1800000, true);
  view.setInt32(320, 381000, true);
  view.setInt32(324, 762000, true);
  view.setUint8(340, 255);
  view.setUint8(341, 4);
  return {
    version: 0x2027,
    view,
    sections,
    postLayerOffset: 0,
    containerItemsOffset: 0,
  };
}
test("PADS Padstack retains carrier slots, unknown shapes and successor metadata without losing ordinals", async () => {
  const p = await readPadsPadstacks(fixture());
  expect(p.length).toBe(3);
  expect(p[0].active).toBe(true);
  expect(p[1].active).toBe(false);
  expect(p[2].index).toBe(2);
  expect(p[0].width).toBe(381000 * PADS_BASIC_TO_MM);
  expect(p[0].slotLength).toBe(762000 * PADS_BASIC_TO_MM);
  expect(p[0].slotAngle).toBe(Math.PI / 2);
  expect(p[0].layers[0].selector).toBe(255);
  expect(p[0].layers[0].shapeCode).toBe(4);
  expect(p[0].layers[0].sourceOffset).toBe(316);
  expect(p[0].layers[0].metadataOffset).toBe(340);
});
test("PADS Padstack rejects out-of-range layer references and respects cancellation", async () => {
  const c = fixture();
  c.view.setUint32(152, 2, true);
  await expect(readPadsPadstacks(c)).rejects.toThrow(/引用越界/);
  const controller = new AbortController();
  controller.abort();
  await expect(
    readPadsPadstacks(fixture(), controller.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
});

test("PADS modern hole flags distinguish NPTH and retain unknown attributes", async () => {
  const c = fixture();
  c.view.setUint32(164, 2, true);
  let p = (await readPadsPadstacks(c))[0];
  expect(p.plated).toBe(false);
  expect(p.holeFlags).toBe(2);
  expect(p.slotLength).toBe(0);
  c.view.setUint32(164, 10, true);
  p = (await readPadsPadstacks(c))[0];
  expect(p.plated).toBe(false);
  expect(p.slotLength > 0).toBeTruthy();
  c.view.setUint32(164, 4, true);
  p = (await readPadsPadstacks(c))[0];
  expect(p.plated).toBe(undefined);
  expect(p.holeFlags).toBe(4);
});

test("PADS 2026 separates fixed inner/back rows from explicit successor layer selectors", async () => {
  const c = fixture();
  c.version = 0x2026;
  c.sections[5].count = 3;
  c.sections[5].declaredBytes = 72;
  c.view.setUint8(158, 3);
  c.view.setUint8(364, 0);
  c.view.setUint8(365, 3);
  c.view.setUint8(388, 23);
  c.view.setUint8(389, 2);
  const rows = (await readPadsPadstacks(c))[0].layers;
  expect(
    rows.map((p) => [p.selector, p.rawSelector, p.shapeCode]),
  ).toStrictEqual([
    [0, 255, 4],
    [255, 0, 3],
    [23, 23, 2],
  ]);
  expect(rows[0].metadataOffset).toBe(340);
  expect(rows[0].shapeOffset).toBe(341);
});

test("PADS 2024 retains successor selector and shape even for the final geometry row", async () => {
  const c = fixture();
  c.version = 0x2024;
  c.view.setUint32(152, 1, true);
  c.view.setInt32(344, 381000, true);
  c.view.setUint8(364, 255);
  c.view.setUint8(365, 3);
  const p = (await readPadsPadstacks(c))[0].layers[0];
  expect(p.selector).toBe(0);
  expect(p.rawSelector).toBe(255);
  expect(p.shapeCode).toBe(3);
  expect(p.width).toBe(381000 * PADS_BASIC_TO_MM);
  expect(p.sourceOffset).toBe(340);
  expect(p.metadataOffset).toBe(364);
  expect(p.shapeOffset).toBe(365);
});

test("PADS 2011 preserves distinct fixed inner/back shapes and an explicit mask row", async () => {
  const c = fixture();
  c.version = 0x2011;
  new Uint8Array(c.view.buffer).fill(0);
  Object.assign(c.sections[4], { count: 1, declaredBytes: 40, offset: 100 });
  Object.assign(c.sections[5], { count: 3, declaredBytes: 60 });
  c.view.setUint8(122, 254);
  c.view.setUint8(123, 2);
  c.view.setUint8(124, 3);
  for (let j = 0; j < 3; j++)
    c.view.setInt32(140 + j * 20, 38100 * (j + 1), true);
  c.view.setUint8(156, 255);
  c.view.setUint8(157, 2);
  c.view.setUint8(176, 0);
  c.view.setUint8(177, 3);
  c.view.setUint8(196, 25);
  c.view.setUint8(197, 2);
  const rows = (await readPadsPadstacks(c))[0].layers;
  expect(
    rows.map((r) => [r.selector, r.rawSelector, r.shapeCode]),
  ).toStrictEqual([
    [0, 255, 2],
    [255, 0, 3],
    [25, 25, 2],
  ]);
  expect(rows.map((r) => r.width)).toStrictEqual(
    [38100, 76200, 114300].map((n) => n * PADS_BASIC_TO_MM),
  );
});

test("PADS old hole carrier preserves an unplated oblique slot and compact NPTH", async () => {
  const c = fixture();
  new Uint8Array(c.view.buffer).fill(0);
  c.version = 0x2021;
  Object.assign(c.sections[4], { count: 1, declaredBytes: 52, offset: 124 });
  Object.assign(c.sections[5], { count: 0, declaredBytes: 0 });
  c.view.setInt32(128, 38100, true);
  c.view.setUint8(148, 254);
  c.view.setUint8(149, 2);
  c.view.setUint32(156, 10, true);
  c.view.setInt32(164, 114300, true);
  c.view.setInt32(168, 37 * 1800000, true);
  let p = (await readPadsPadstacks(c))[0];
  expect(p.plated).toBe(false);
  expect(p.holeFlags).toBe(10);
  expect(p.slotLength).toBe(114300 * PADS_BASIC_TO_MM);
  expect(Math.abs(p.slotAngle - (37 * Math.PI) / 180) < 1e-12).toBeTruthy();
  new Uint8Array(c.view.buffer).fill(0);
  c.version = 0x2011;
  Object.assign(c.sections[4], { count: 1, declaredBytes: 40, offset: 100 });
  c.view.setInt32(104, 38100, true);
  c.view.setUint8(122, 254);
  c.view.setUint8(123, 2);
  c.view.setUint32(128, 2, true);
  p = (await readPadsPadstacks(c))[0];
  expect(p.plated).toBe(false);
  expect(p.drill).toBe(38100 * PADS_BASIC_TO_MM);
});
