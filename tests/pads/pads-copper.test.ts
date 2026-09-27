import { test, expect } from "vitest";

import { assemblePadsCopper } from "../../src/lib/pads/copper/copper";
type Source = Parameters<typeof assemblePadsCopper>[0];
function fixture() {
  const owners = [0, 1, 2, 3].map((index) => ({
    index,
    pieceCount: 1,
    pieceStart: index,
  }));
  const pieces = [0, 1, 2, 3].map((index) => ({
    index,
    owner: index,
    type: index === 3 ? 52 : 50,
    layer: 2,
    width: 0.2,
    arcs: [],
    points: (index === 3
      ? [
          [0, 0],
          [0, 0],
        ]
      : [
          [0, 0],
          [2, 0],
          [0, 2],
          [0, 0],
        ]) as [number, number][],
  }));
  return { owners, pieces } satisfies Source;
}
const groups = [
  { boundary: 0, rawNet: 0, fills: [{ owner: 1, holes: [2], thermals: [3] }] },
];
test("PADS copper groups retain holes and unresolved coincident thermal pieces", async () => {
  const r = await assemblePadsCopper(fixture(), groups, new Map([[1, 0]]));
  expect(r.fills.length).toBe(1);
  expect(r.fills[0].holes.length).toBe(1);
  expect(r.fills[0].unresolvedThermalPieces).toStrictEqual([3]);
  expect(r.fills[0].zeroWidthThermalMarkers).toStrictEqual([]);
  expect(r.fills[0].net).toBe(0);
});
test("PADS zero-width coincident thermal record is retained as a non-geometric marker", async () => {
  const source = fixture();
  source.pieces[3].width = 0;
  const r = await assemblePadsCopper(source, groups, new Map([[1, 0]]));
  expect(r.fills[0].zeroWidthThermalMarkers).toStrictEqual([3]);
  expect(r.fills[0].unresolvedThermalPieces).toStrictEqual([]);
  expect(r.fills[0].thermals.length).toBe(0);
});
test("PADS copper rejects cross-layer holes and retains unfilled boundaries", async () => {
  const s = fixture();
  s.pieces[2].layer = 1;
  const r = await assemblePadsCopper(s, groups, new Map([[1, 0]]));
  expect(r.fills.length).toBe(0);
  expect(r.diagnostics[0].error).toMatch(/层不匹配/);
  expect(
    (
      await assemblePadsCopper(
        s,
        [{ boundary: 0, rawNet: 0, fills: [] }],
        new Map(),
      )
    ).boundaryOnly,
  ).toStrictEqual([0]);
});
