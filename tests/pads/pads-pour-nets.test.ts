import { test, expect } from "vitest";

import { resolvePadsPourNets } from "../../src/lib/pads/copper/pour-nets";
type Args = Parameters<typeof resolvePadsPourNets>;
const owners = [
  { relationshipId: 0 },
  { relationshipId: 0 },
  { relationshipId: 0 },
  { relationshipId: 17 },
] as Args[0];
const groups = [
  { boundary: 0, rawNet: 0, fills: [{ owner: 1, holes: [2], thermals: [3] }] },
];
const nets = [
  {
    ordinal: 0,
    name: { text: "GND", raw: new Uint8Array([71, 78, 68]), offset: 0 },
    self: 0,
    classOwner: 0,
    anchors: [0, 0],
  },
] as Args[2];
test("PADS copper retains source net zero and propagates it through void/thermal ownership", async () => {
  const r = await resolvePadsPourNets(owners, groups, nets, [
    { junction: 17, net: 0 },
  ]);
  expect([...r.ownerNets]).toStrictEqual([
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
  ]);
  expect(r.checked).toBe(1);
  expect(r.unwitnessed.length).toBe(0);
  expect(
    (await resolvePadsPourNets(owners, groups, nets, [])).unwitnessed.length,
  ).toBe(1);
});
test("PADS copper rejects conflicting network evidence and preserves unassigned sentinel", async () => {
  await expect(
    resolvePadsPourNets(owners, groups, nets, [{ junction: 17, net: 2 }]),
  ).rejects.toThrow(/网络冲突/);
  const r = await resolvePadsPourNets(
    owners,
    [{ boundary: 0, rawNet: -1, fills: [] }],
    nets,
    [],
  );
  expect(r.ownerNets.get(0)).toBe(null);
  await expect(
    resolvePadsPourNets(
      owners,
      [{ boundary: 0, rawNet: 5, fills: [] }],
      nets,
      [],
    ),
  ).rejects.toThrow(/引用无效/);
});
