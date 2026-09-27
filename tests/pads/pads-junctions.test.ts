import { test, expect } from "vitest";

import { readPadsJunctions } from "../../src/lib/pads/binary/junctions";
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
  Object.assign(sections[49], { offset: 0, bytes: 20 });
  Object.assign(sections[60], { offset: 200, count: 1, declaredBytes: 64 });
  sections[24].count = 1;
  [1, 0x3c000000, 1, 0x18000000, 0].forEach((n, i) =>
    view.setUint32(i * 4, n, true),
  );
  view.setInt32(200, 38100, true);
  view.setUint32(208, 55, true);
  view.setUint8(227, 14);
  view.setUint8(231, 23);
  view.setUint8(232, 2);
  const c: PadsContainer = {
    view,
    sections,
    version: 0x2026,
    postLayerOffset: 0,
    containerItemsOffset: 0,
  };
  const nets = [
    {
      ordinal: 0,
      name: { text: "GND", raw: new Uint8Array([71, 78, 68]), offset: 0 },
    },
  ] as PadsNet[];
  const footprints = [{ terminals: [{ padstack: 2 }] }] as PadsFootprint[];
  return { c, nets, footprints };
}
test("PADS junction relationships provide Via network evidence and preserve source handles", async () => {
  const { c, nets, footprints } = sample(),
    r = await readPadsJunctions(c, nets, footprints);
  expect(r.vias.length).toBe(1);
  expect(r.vias[0].padstack).toBe(2);
  expect(r.vias[0].relationshipNet).toBe(0);
  expect(r.handles).toStrictEqual([{ junction: 0, handle: 55, net: 0 }]);
  c.view.setUint8(227, 22);
  expect((await readPadsJunctions(c, nets, footprints)).vias.length).toBe(0);
});
test("PADS relationship member bounds and Via definitions are checked separately", async () => {
  const { c, nets, footprints } = sample();
  const r = await readPadsJunctions(c, nets, []);
  expect(r.unresolved.length).toBe(1);
  c.view.setUint32(12, 0x18000001, true);
  await expect(readPadsJunctions(c, nets, footprints)).rejects.toThrow(
    /成员越界/,
  );
});
