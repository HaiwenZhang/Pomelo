import { test, expect } from "vitest";

import { readPadsPourLinks } from "../../src/lib/pads/copper/pour-links";
type Owner = Parameters<typeof readPadsPourLinks>[0][number];
function fixture(): Owner[] {
  return [
    [50, 7, 1, -1],
    [51, 2, -1, 4],
    [52, -2, 2, 7],
    [53, 99, -1, -2],
    [54, 101, -1, 3],
  ].map(
    ([type, relationshipId, objectHandle, parentRelationshipId], index) => ({
      index,
      type,
      relationshipId,
      objectHandle,
      parentRelationshipId,
      nameBytes: [],
      associationHandle: 0,
      stateFlags: 0,
      nameFlags: 192,
      origin: [0, 0],
      pieceStart: 0,
      vertexStart: 0,
      arcStart: 0,
      pieceCount: 0,
      raw: new Uint8Array(88),
    }),
  );
}
test("PADS copper lists separate fills, voids and thermal records using parent-specific negative terminators", async () => {
  expect(await readPadsPourLinks(fixture())).toStrictEqual([
    {
      boundary: 0,
      rawNet: 7,
      fills: [{ owner: 1, holes: [2], thermals: [4, 3] }],
    },
  ]);
});
test("PADS copper chains reject cycles, wrong terminators and orphan records", async () => {
  const cycle = fixture();
  cycle[3].parentRelationshipId = 4;
  await expect(readPadsPourLinks(cycle)).rejects.toThrow(/归属链无效/);
  const tail = fixture();
  tail[2].relationshipId = -1;
  await expect(readPadsPourLinks(tail)).rejects.toThrow(/链尾不匹配/);
  const orphan = fixture();
  orphan[1].parentRelationshipId = 1;
  await expect(readPadsPourLinks(orphan)).rejects.toThrow(/未归属/);
});
