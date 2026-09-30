import { expect, test } from "vitest";
import { createCopperZone } from "../../src/lib/board/copper-zone";
import { SegmentShape } from "../../src/lib/board/shapes/segment";
import { ZoneShape } from "../../src/lib/board/shapes/zone";
import type { Point } from "../../src/lib/board/model";

test("shared copper construction retains analytic holes and packs flattened rings once", async () => {
  const paths = [
    [SegmentShape.fromPoints([5, 0], [5, 0], 0, [0, 0])],
    [SegmentShape.fromPoints([2, 0], [2, 0], 0, [0, 0], true)],
  ];
  const zone = await createCopperZone({ id: 10, layer: 2, net: 3, paths });
  const shape = new ZoneShape(zone);
  expect(zone.paths).toBe(paths);
  expect(zone.rings).toEqual([]);
  expect(zone.curved).toBe(true);
  expect(shape.contains([0, 0])).toBe(false);
  expect(shape.contains([3, 0])).toBe(true);
  expect(shape.bounds()).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 });
});

test("packed polygon picking ignores distant holes and still excludes nearby holes", async () => {
  const rings: Point[][] = [
    [
      [-1, -1],
      [1000, -1],
      [1000, 1000],
      [-1, 1000],
    ],
  ];
  for (let i = 0; i < 200; i++) {
    const x = 10 + (i % 20) * 10,
      y = 10 + Math.floor(i / 20) * 10;
    rings.push([
      [x, y],
      [x, y + 1],
      [x + 1, y + 1],
      [x + 1, y],
    ]);
  }
  const zone = await createCopperZone({ id: 1, layer: 0, net: 1, rings });
  let reads = 0;
  zone.points = new Proxy(zone.points, {
    get(target, key) {
      if (typeof key === "string" && /^\d+$/.test(key)) reads++;
      return Reflect.get(target, key, target);
    },
  });
  const shape = new ZoneShape(zone);
  expect(shape.contains([0, 0])).toBe(true);
  expect(reads).toBeLessThan(64);
  reads = 0;
  expect(shape.contains([10.5, 10.5])).toBe(false);
  expect(reads).toBeLessThan(64);
});

test("large analytic contours can be cancelled during flattening and retried", async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(
      createCopperZone(
        {
          id: 1,
          layer: 0,
          net: 0,
          paths: [[SegmentShape.fromPoints([1e9, 0], [1e9, 0], 0, [0, 0])]],
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    clearTimeout(timer);
  }
  const zone = await createCopperZone({
    id: 1,
    layer: 0,
    net: 0,
    rings: [
      [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    ],
  });
  expect(zone.indices).toHaveLength(3);
});
