import { test, expect } from "vitest";

import { readPadsConnectivity } from "../../src/lib/pads/binary/connectivity";
import type { PadsContainer } from "../../src/lib/pads/binary/container";
import type { PadsNet } from "../../src/lib/pads/binary/metadata";
import type { PadsFootprint } from "../../src/lib/pads/binary/footprints";
function sample() {
  const view = new DataView(new ArrayBuffer(400)),
    sections = Array.from({ length: 75 }, (_, index) => ({
      index,
      count: 0,
      declaredBytes: 0,
      offset: 0,
      bytes: 0,
      records: 0,
    }));
  Object.assign(sections[24], { count: 2, declaredBytes: 136, offset: 136 });
  for (let i = 0; i < 2; i++) {
    const at = 100 + i * 68;
    for (const [off, value] of [
      [52, 65534],
      [60, i],
      [64, i + 1],
      [68, 1],
      [72, 1],
      [88, 0xfe000000],
    ])
      view.setUint32(at + off, value, true);
  }
  const c: PadsContainer = {
    view,
    sections,
    version: 0x2026,
    postLayerOffset: 0,
    containerItemsOffset: 0,
  };
  const fp = [{ terminals: [{}] }] as PadsFootprint[],
    instances = [0, 1, 2].map((placement) => ({ placement, footprint: 0 }));
  return { c, fp, instances };
}
const net = (ordinal: number, text: string): PadsNet => ({
  ordinal,
  name: { text, raw: new TextEncoder().encode(text), offset: 0 },
  self: 0,
  classOwner: 0,
  anchors: [ordinal, 1],
});
test("PADS connection components assign named nets across edges and retain autoroute aliases", async () => {
  const { c, fp, instances } = sample(),
    r = await readPadsConnectivity(
      c,
      [net(0, "$$$1"), net(1, "GND")],
      fp,
      instances,
    );
  expect(r.assignments.length).toBe(3);
  expect(r.assignments.every((p) => p.net === 1)).toBeTruthy();
  expect(r.aliases.length).toBe(1);
  expect(r.unresolved.length).toBe(0);
});
test("PADS rejects conflicting named networks and corrupt connection framing", async () => {
  const { c, fp, instances } = sample();
  await expect(
    readPadsConnectivity(c, [net(0, "GND"), net(1, "VCC")], fp, instances),
  ).rejects.toThrow(/归属冲突/);
  c.view.setUint32(188, 0, true);
  await expect(
    readPadsConnectivity(c, [net(0, "GND")], fp, instances),
  ).rejects.toThrow(/连接标记/);
});

test("PADS 0x2011 compact endpoints agree with packed network anchors and edge counts", async () => {
  const { c, fp, instances } = sample();
  c.version = 0x2011;
  new Uint8Array(c.view.buffer).fill(0);
  Object.assign(c.sections[24], { offset: 100, count: 2, declaredBytes: 96 });
  Object.assign(c.sections[23], { offset: 260, count: 1, declaredBytes: 124 });
  for (let i = 0; i < 2; i++) {
    const at = 116 + i * 48;
    for (const [off, value] of [
      [0, 65534],
      [4, i],
      [6, i + 1],
      [8, 1],
      [10, 1],
      [20, 0xfe00],
    ])
      c.view.setUint16(at + off, value, true);
  }
  c.view.setUint16(276, 99, true); // adjacent state is not the terminal ordinal
  c.view.setUint16(278, 2, true);
  c.view.setUint16(280, 1, true);
  c.view.setUint16(282, 0, true);
  c.view.setUint32(364, 2, true);
  const r = await readPadsConnectivity(c, [net(0, "GND")], fp, instances);
  expect(r.assignments.length).toBe(3);
  expect(r.unowned).toBe(0);
  expect(r.unresolved.length).toBe(0);
  c.view.setUint32(364, 1, true);
  await expect(
    readPadsConnectivity(c, [net(0, "GND")], fp, instances),
  ).rejects.toThrow(/锚点无效/);
});
