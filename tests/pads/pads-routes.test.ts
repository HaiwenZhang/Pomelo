import { test, expect } from "vitest";

import { readPadsRoutes } from "../../src/lib/pads/binary/routes";
import {
  PADS_BASIC_TO_MM,
  type PadsLayer,
} from "../../src/lib/pads/binary/metadata";
import type { PadsContainer } from "../../src/lib/pads/binary/container";
function sample() {
  const view = new DataView(new ArrayBuffer(1000)),
    sections = Array.from({ length: 75 }, (_, index) => ({
      index,
      count: 0,
      declaredBytes: 0,
      offset: 0,
      bytes: 0,
      records: 0,
    }));
  const section = (
    index: number,
    offset: number,
    count: number,
    bytes: number,
  ) =>
    Object.assign(sections[index], {
      offset,
      count,
      declaredBytes: bytes,
      bytes,
      records: count,
    });
  const u = (at: number, value: number) => view.setUint32(at, value, true);
  section(25, 0, 1, 188);
  view.setUint16(186, 1, true);
  section(26, 200, 1, 12);
  u(200, 42);
  section(61, 300, 1, 12);
  u(308, 0x800000);
  section(27, 400, 1, 4);
  u(400, 1);
  section(29, 420, 1, 4);
  u(420, 42);
  section(63, 440, 1, 2);
  section(62, 460, 1, 48);
  u(464, 9525);
  u(480, 1);
  section(64, 520, 1, 12);
  u(520, 10);
  u(524, 20);
  u(528, 30);
  return {
    c: {
      view,
      sections,
      version: 0x2026,
      postLayerOffset: 0,
      containerItemsOffset: 0,
    } as PadsContainer,
    layers: [{}, { direction: 1 }] as PadsLayer[],
  };
}
test("PADS route ring maps allocator handles to layer, network and oriented cell endpoints", async () => {
  const { c, layers } = sample(),
    r = await readPadsRoutes(c, layers, [{ handle: 42, net: 7 }]);
  expect(r.routes.length).toBe(1);
  expect(r.routes[0].net).toBe(7);
  expect(r.routes[0].layer).toBe(1);
  expect(r.routes[0].points).toStrictEqual([
    [10 * PADS_BASIC_TO_MM, 20 * PADS_BASIC_TO_MM],
    [30 * PADS_BASIC_TO_MM, 20 * PADS_BASIC_TO_MM],
  ]);
  layers[1].direction = 2;
  const swapped = await readPadsRoutes(c, layers, [{ handle: 42, net: 7 }]);
  expect(swapped.routes[0].points[0]).toStrictEqual([
    20 * PADS_BASIC_TO_MM,
    10 * PADS_BASIC_TO_MM,
  ]);
});
test("PADS routes reject ambiguous net evidence and incomplete cell partitions", async () => {
  const { c, layers } = sample();
  await expect(
    readPadsRoutes(c, layers, [
      { handle: 42, net: 7 },
      { handle: 42, net: 8 },
    ]),
  ).rejects.toThrow(/网络证据不唯一/);
  c.view.setUint32(480, 0, true);
  await expect(
    readPadsRoutes(c, layers, [{ handle: 42, net: 7 }]),
  ).rejects.toThrow(/未完整消费/);
});
test("PADS allocated but unused tail node page does not invent serialized records", async () => {
  const { c, layers } = sample();
  c.sections[26].count = 2;
  c.view.setUint16(186, 2, true);
  c.view.setUint32(212, 10000, true);
  c.view.setUint32(216, 66000, true);
  c.view.setUint32(220, 100, true);
  const r = await readPadsRoutes(c, layers, [{ handle: 42, net: 7 }]);
  expect(r.routes.length).toBe(1);
  expect(r.routes[0].handle).toBe(42);
  c.view.setUint32(208, 1, true);
  await expect(
    readPadsRoutes(c, layers, [{ handle: 42, net: 7 }]),
  ).rejects.toThrow(/页序号无效/);
});
