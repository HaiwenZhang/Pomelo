import { test, expect } from "vitest";

import type { BrdDatabase } from "../../src/lib/allegro/database";
import { AllegroGeometryDecoder } from "../../src/lib/allegro/decoders/geometry";

import { PathShape } from "../../src/lib/board/shapes/path";

const database = (get: (id: number) => unknown) => ({ get }) as BrdDatabase;
const line = (
  Key: number,
  Next: number,
  StartX: number,
  StartY: number,
  EndX: number,
  EndY: number,
) => ({ type: 21, Key, Next, StartX, StartY, EndX, EndY, Width: 0 });
function mixedContours() {
  const rows = new Map<number, unknown>([
    [1, { type: 40, FirstSegmentPtr: 10, FirstKeepoutPtr: 2 }],
    [2, { type: 52, FirstSegmentPtr: 20, Next: 3 }],
    [3, { type: 52, FirstSegmentPtr: 0, Next: 4 }],
    [4, { type: 52, FirstSegmentPtr: 30, Next: 0 }],
    [10, line(10, 11, 0, 0, 20, 0)],
    [11, line(11, 12, 20, 0, 20, 20)],
    [12, line(12, 13, 20, 20, 0, 20)],
    [13, line(13, 10, 0, 20, 0, 0)],
    [
      20,
      {
        type: 1,
        Key: 20,
        Next: 2,
        StartX: 8,
        StartY: 5,
        EndX: 8,
        EndY: 5,
        CenterX: 5,
        CenterY: 5,
        Width: 0,
        SubType: 64,
      },
    ],
    [30, line(30, 0, 1, 1, 2, 1)],
  ]);
  return { db: database((id) => rows.get(id)), rows };
}

test("cooperative copper preserves exterior, clockwise circular hole and degenerate contour filtering", async () => {
  const { db } = mixedContours(),
    actual = await new AllegroGeometryDecoder(db, 0.1).readContours(1);
  const expected = new AllegroGeometryDecoder(db, 0.1)
    .readShapePaths(1)
    .map((path) => ({ path, ring: new PathShape(path).flatten() }))
    .filter((c) => c.ring.length >= 3);
  expect(actual).toStrictEqual({
    paths: expected.map((c) => c.path),
    rings: expected.map((c) => c.ring),
  });
  expect(actual.paths.length).toBe(2);
  expect(actual.rings[0]).toStrictEqual([
    [0, 0],
    [2, 0],
    [2, 2],
    [0, 2],
  ]);
  expect(actual.paths[1][0].arc!.sweep).toBe(-2 * Math.PI);
  for (const p of actual.rings[1])
    expect(
      Math.abs(Math.hypot(p[0] - 0.5, p[1] - 0.5) - 0.3) < 1e-12,
    ).toBeTruthy();
  expect(
    await new AllegroGeometryDecoder(db, 1).readContours(999),
  ).toStrictEqual({
    paths: [],
    rings: [],
  });
});

test("cooperative contour reader retains malformed path and hole chain errors", async () => {
  const { db, rows } = mixedContours();
  rows.set(13, line(13, 11, 0, 20, 0, 0));
  expect(() => new AllegroGeometryDecoder(db, 1).readShapePaths(1)).toThrow(
    /路径链循环 11/,
  );
  await expect(
    new AllegroGeometryDecoder(db, 1).readContours(1),
  ).rejects.toThrow(/路径链循环 11/);
  rows.set(13, line(13, 10, 0, 20, 0, 0));
  rows.set(4, { type: 52, FirstSegmentPtr: 30, Next: 2 });
  expect(() => new AllegroGeometryDecoder(db, 1).readShapePaths(1)).toThrow(
    /铜皮孔洞链循环 2/,
  );
  await expect(
    new AllegroGeometryDecoder(db, 1).readContours(1),
  ).rejects.toThrow(/铜皮孔洞链循环 2/);
});

for (const kind of ["long-path", "many-holes", "single-arc"] as const)
  test(`copper cancellation interrupts ${kind} and allows a fresh retry`, async () => {
    const count = 1_000_000;
    let reads = 0;
    const db = database((id) => {
      if (id === 1)
        return {
          type: 40,
          FirstSegmentPtr: kind === "many-holes" ? 0 : 100,
          FirstKeepoutPtr: kind === "many-holes" ? 100 : 0,
        };
      if (kind === "single-arc" && id === 100)
        return {
          type: 1,
          Key: 100,
          Next: 0,
          StartX: 1e9,
          StartY: 0,
          EndX: 1e9,
          EndY: 0,
          CenterX: 0,
          CenterY: 0,
          Width: 0,
          SubType: 0,
        };
      if (id >= 100 && id < 100 + count) {
        reads++;
        const next = id === 99 + count ? 0 : id + 1;
        return kind === "many-holes"
          ? { type: 52, FirstSegmentPtr: 0, Next: next }
          : line(id, next, id, 0, id + 1, 0);
      }
    });
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 0);
    try {
      await expect(
        new AllegroGeometryDecoder(db, 1).readContours(1, controller.signal),
      ).rejects.toMatchObject({
        name: "AbortError",
      });
    } finally {
      clearTimeout(timer);
    }
    if (kind !== "single-arc")
      expect(
        reads > 0 && reads < count,
        "cancel before consuming the entire chain",
      ).toBeTruthy();
    const retry = await new AllegroGeometryDecoder(
      mixedContours().db,
      1,
    ).readContours(1);
    expect(retry.paths.length).toBe(2);
    await expect(
      new AllegroGeometryDecoder(db, 1).readContours(1, controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  });
