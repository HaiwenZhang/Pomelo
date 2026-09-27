import { test, expect } from "vitest";

import { readPadsPours } from "../../src/lib/pads/binary/pours";
import type { PadsContainer } from "../../src/lib/pads/binary/container";
import { PADS_BASIC_TO_MM } from "../../src/lib/pads/binary/metadata";

function fixture() {
  const view = new DataView(new ArrayBuffer(240));
  const sections = Array.from({ length: 75 }, (_, index) => ({
    index,
    count: 0,
    declaredBytes: 0,
    offset: 0,
    bytes: 0,
    records: 0,
  }));
  for (const [section, offset, count, stride] of [
    [52, 0, 2, 88],
    [53, 176, 2, 16],
    [54, 208, 4, 8],
  ])
    Object.assign(sections[section], { offset, count, bytes: count * stride });
  for (let owner = 0; owner < 2; owner++) {
    const at = owner * 88;
    view.setUint32(at, owner, true);
    view.setUint32(at + 4, owner * 2, true);
    view.setUint32(at + 64, 1, true);
    view.setInt32(at + 12, owner + 10, true);
    view.setInt32(at + 20, owner ? 10 : -1, true);
    view.setUint8(at + 70, 72);
    view.setUint8(at + 71, 80);
    view.setUint8(at + 87, owner ? 52 : 50);
    view.setInt32(at + 24, owner ? 0 : 38100, true);
    view.setUint32(176 + owner * 16, 2, true);
    view.setUint8(188 + owner * 16, owner ? 52 : 51);
    view.setInt32(208 + owner * 16, 38100, true);
    view.setInt32(216 + owner * 16, 76200, true);
  }
  return {
    view,
    sections,
    version: 0x2026,
    postLayerOffset: 0,
    containerItemsOffset: 0,
  } as PadsContainer;
}

test("PADS non-POR owners and child outline pieces retain geometry and relationship evidence", async () => {
  const r = await readPadsPours(fixture());
  expect(r.pieces.length).toBe(2);
  expect(
    r.owners.map((o) => [o.type, o.relationshipId, o.parentRelationshipId]),
  ).toStrictEqual([
    [50, 10, -1],
    [52, 11, 10],
  ]);
  expect(r.pieces.map((p) => p.type)).toStrictEqual([51, 52]);
  expect(r.pieces[0].points).toStrictEqual([
    [76200 * PADS_BASIC_TO_MM, 0],
    [114300 * PADS_BASIC_TO_MM, 0],
  ]);
  expect(r.pieces[1].points).toStrictEqual([
    [38100 * PADS_BASIC_TO_MM, 0],
    [76200 * PADS_BASIC_TO_MM, 0],
  ]);
});

test("PADS child outline bounds are validated even without a POR name", async () => {
  const c = fixture();
  c.view.setUint32(88 + 4, 4, true);
  await expect(readPadsPours(c)).rejects.toThrow(/顶点引用越界/);
});

test("PADS pour arcs preserve signed major sweeps and translate the center with the owner", async () => {
  const c = fixture(),
    buffer = new ArrayBuffer(272);
  new Uint8Array(buffer).set(new Uint8Array(c.view.buffer));
  c.view = new DataView(buffer);
  Object.assign(c.sections[55], { offset: 240, count: 2, bytes: 32 });
  c.view.setUint32(180, 1, true);
  c.view.setUint32(88 + 8, 1, true);
  c.view.setUint32(196, 1, true);
  c.view.setInt32(240, 38100, true);
  c.view.setInt16(252, -900, true);
  c.view.setInt16(254, -2700, true);
  c.view.setInt16(270, 900, true);
  const r = await readPadsPours(c);
  expect(r.pieces[0].arcs).toStrictEqual([
    {
      sourceIndex: 0,
      vertexIndex: 0,
      center: [76200 * PADS_BASIC_TO_MM, 0],
      beginTenths: -900,
      sweepTenths: -2700,
    },
  ]);
  expect(r.pieces[1].arcs[0].sourceIndex).toBe(1);
  c.view.setUint32(248, 1, true);
  await expect(readPadsPours(c)).rejects.toThrow(/圆弧顶点引用无效/);
});
