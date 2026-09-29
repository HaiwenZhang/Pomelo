import { test, expect } from "vitest";

import { CopperMesh } from "../../src/lib/board/copper-mesh";
import type { Point } from "../../src/lib/board/model";
import { ZoneShape } from "../../src/lib/board/shapes/zone";

import { visibleCopperRanges } from "../../src/lib/render/view-culling";

test("independent copper contours retain coordinates and separate exterior from void coverage", async () => {
  const rings: Point[][] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    [
      [3, 3],
      [3, 7],
      [7, 7],
      [7, 3],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
    ],
  ];
  const mesh = await new CopperMesh(rings).build();
  expect([...mesh.points]).toStrictEqual(rings.flat(2));
  expect(mesh.outerCount).toBe(6);
  expect(mesh.indices.length).toBe(18);
  expect(
    [...mesh.indices.subarray(0, mesh.outerCount)].every((i) => i < 4),
  ).toBeTruthy();
  expect(
    [...mesh.indices.subarray(mesh.outerCount)].every((i) => i >= 4 && i < 12),
  ).toBeTruthy();
  const zone = { id: 1, layer: 0, net: 0, paths: [], rings: [], ...mesh };
  expect(new ZoneShape(zone).ringCount()).toBe(3);
  expect(new ZoneShape(zone).bounds()).toStrictEqual({
    minX: 0,
    minY: 0,
    maxX: 10,
    maxY: 10,
  });
  expect(new ZoneShape(zone).contains([1, 1])).toBe(true);
  expect(new ZoneShape(zone).contains([5, 5])).toBe(false);
  expect(new ZoneShape(zone).contains([11, 5])).toBe(false);
});
test("copper mesh accepts reversed winding and honors cancellation", async () => {
  const ring: Point[] = [
    [0, 0],
    [4, 0],
    [4, 4],
    [2, 2],
    [0, 4],
  ];
  for (const points of [ring, ring.toReversed()])
    expect((await new CopperMesh([points]).build()).indices.length).toBe(9);
  const cancel = new AbortController();
  cancel.abort();
  await expect(
    new CopperMesh([ring]).build(cancel.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
});

test("an active large copper mesh can be cancelled and rebuilt", async () => {
  const ring: Point[] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(
      new CopperMesh(new Array(100000).fill(ring)).build(controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  } finally {
    clearTimeout(timer);
  }
  const retry = await new CopperMesh([ring]).build();
  expect([...retry.points]).toStrictEqual(ring.flat());
  expect([...retry.indices]).toStrictEqual([2, 3, 0, 2, 0, 1]);
});

test("spatial hole ranges are complete, conservative, and merge at board fit", async () => {
  const rings: Point[][] = [
    [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100],
    ],
  ];
  // Alternating distant holes makes spatial sorting necessary for tight chunks.
  for (let i = 0; i < 256; i++) {
    const x = (i % 16) * 6 + 1,
      y = Math.floor(i / 16) * 6 + 1;
    rings.push([
      [x, y],
      [x + 2, y],
      [x + 2, y + 2],
      [x, y + 2],
    ]);
  }
  const mesh = await new CopperMesh(rings).build();
  expect([...mesh.points]).toStrictEqual(rings.flat(2));
  expect(mesh.holeChunks.length).toBe(4);
  let end = mesh.outerCount;
  for (const chunk of mesh.holeChunks) {
    expect(chunk.start).toBe(end);
    end += chunk.count;
    for (const i of mesh.indices.subarray(chunk.start, end)) {
      const x = mesh.points[i * 2],
        y = mesh.points[i * 2 + 1],
        b = chunk.bounds;
      expect(
        x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY,
      ).toBeTruthy();
    }
  }
  expect(end).toBe(mesh.indices.length);
  expect([
    ...visibleCopperRanges(mesh.holeChunks, {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
    }),
  ]).toStrictEqual([
    { start: mesh.outerCount, count: mesh.indices.length - mesh.outerCount },
  ]);
  const visible = [
    ...visibleCopperRanges(mesh.holeChunks, {
      minX: 0,
      minY: 0,
      maxX: 10,
      maxY: 10,
    }),
  ];
  expect(
    visible.reduce((sum, r) => sum + r.count, 0) <
      (mesh.indices.length - mesh.outerCount) / 2,
  ).toBeTruthy();
  expect([
    ...visibleCopperRanges(mesh.holeChunks, {
      minX: 200,
      minY: 200,
      maxX: 210,
      maxY: 210,
    }),
  ]).toStrictEqual([]);
  // A view touching a hole boundary must retain it (conservative comparison).
  expect(
    [
      ...visibleCopperRanges(mesh.holeChunks, {
        minX: 3,
        minY: 3,
        maxX: 3,
        maxY: 3,
      }),
    ].length,
  ).toBeTruthy();
});
