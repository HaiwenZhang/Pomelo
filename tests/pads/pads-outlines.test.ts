import { test, expect } from "vitest";

import { readPadsOutlines } from "../../src/lib/pads/binary/outlines";
import { PADS_BASIC_TO_MM } from "../../src/lib/pads/binary/metadata";
import type { PadsContainer } from "../../src/lib/pads/binary/container";
function fixture(old: boolean, legacy = false) {
  const view = new DataView(new ArrayBuffer(400)),
    sections = Array.from({ length: 75 }, (_, index) => ({
      index,
      count: 0,
      declaredBytes: 0,
      offset: 0,
      bytes: 0,
      records: 0,
    })),
    os = legacy ? 96 : old ? 100 : 112,
    ps = legacy ? 12 : old ? 16 : 20;
  Object.assign(sections[10], { offset: 0, count: 1, bytes: os });
  Object.assign(sections[11], { offset: 120, count: 1, bytes: ps });
  Object.assign(sections[12], { offset: 160, count: 2, bytes: 24 });
  const ow = (field: number, n: number) => {
    for (let k = 0; k < 4; k++)
      view.setUint8((68 + field + k) % os, n >>> (8 * k));
  };
  ow(24, legacy ? 0x10001 : 1);
  if (!legacy) ow(28, 1);
  view.setUint8((68 + (legacy ? 28 : old ? 32 : 44)) % os, 88);
  ow(old ? 72 : 88, 38100);
  view.setInt32(124, 2, true);
  view.setInt32(168, -1, true);
  view.setInt32(172, 38100, true);
  view.setInt32(180, -1, true);
  return {
    view,
    sections,
    version: legacy ? 0x2011 : old ? 0x2021 : 0x2026,
    postLayerOffset: 0,
    containerItemsOffset: 0,
  } as PadsContainer;
}
test("PADS old and new drawing rings use distinct names and origins while preserving outline vertices", async () => {
  for (const old of [true, false]) {
    const r = await readPadsOutlines(fixture(old));
    expect(r.outlines.length).toBe(1);
    expect(r.owners[0].nameBytes).toStrictEqual([88]);
    expect(r.outlines[0].vertices.map((v) => v.at)).toStrictEqual([
      [38100 * PADS_BASIC_TO_MM, 0],
      [76200 * PADS_BASIC_TO_MM, 0],
    ]);
  }
});
test("PADS outline vertex overflow is rejected before reading unrelated records", async () => {
  const c = fixture(true);
  c.view.setInt32(124, 3, true);
  await expect(readPadsOutlines(c)).rejects.toThrow(/顶点引用无效/);
});

test("PADS 0x2011 keeps packed drawing kind separate from the piece count", async () => {
  const r = await readPadsOutlines(fixture(true, true));
  expect(r.owners[0].kind).toBe(1);
  expect(r.owners[0].pieceCount).toBe(1);
  expect(r.owners[0].nameBytes).toStrictEqual([88]);
  expect(r.outlines[0].vertices.map((v) => v.at)).toStrictEqual([
    [38100 * PADS_BASIC_TO_MM, 0],
    [76200 * PADS_BASIC_TO_MM, 0],
  ]);
});

test("PADS ordinary footprint drawings retain empty source pieces without inventing a board outline", async () => {
  const c = fixture(true);
  c.view.setUint32(96, 2, true);
  c.view.setUint32(124, 0, true);
  const r = await readPadsOutlines(c);
  expect(r.outlines.length).toBe(0);
  expect(r.graphics.length).toBe(1);
  expect(r.graphics[0].kind).toBe(2);
  expect(r.graphics[0].vertices.length).toBe(0);
});
