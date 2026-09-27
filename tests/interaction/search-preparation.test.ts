import { test, expect } from "vitest";

import type { BoardScene } from "../../src/lib/board/model";
import { BoardSearchIndex } from "../../src/lib/board/search";

test("prepared search preserves IDs, insertion order, counts and pin/finger component aggregation", async () => {
  const scene = {
    nets: new Map([
      [4, "DATA"],
      [2, "DATA"],
      [9, ""],
    ]),
    segments: [{ net: 4 }, { net: 0 }, { net: 2 }],
    vias: [
      { net: 4, finger: { reference: "U1" } },
      { net: 9, finger: { reference: "U3" } },
    ],
    pins: [
      { net: 2, reference: "U2" },
      { net: 7, reference: "U1" },
      { net: 4, reference: "U1" },
      { net: 0, reference: "" },
    ],
    zones: [{ net: 2 }, { net: 7 }],
  } as unknown as BoardScene;
  const expected = [
    { kind: "net", id: 4, name: "DATA", count: 3 },
    { kind: "net", id: 2, name: "DATA", count: 3 },
    { kind: "net", id: 9, name: "", count: 1 },
    { kind: "net", id: 7, name: "7", count: 2 },
    { kind: "component", id: "U2", name: "U2", count: 1 },
    { kind: "component", id: "U1", name: "U1", count: 3 },
    { kind: "component", id: "U3", name: "U3", count: 1 },
  ];
  const actual = await BoardSearchIndex.buildItemsAsync(scene);
  expect(actual).toStrictEqual(expected);
  expect(BoardSearchIndex.buildItems(scene)).toStrictEqual(expected);
  expect(
    new BoardSearchIndex(actual).find(" data ").map((item) => item.id),
  ).toStrictEqual([4, 2]);
  expect(new BoardSearchIndex(actual).find("u1")).toStrictEqual([expected[5]]);
});

test("search preparation cancels inside a large group and a fresh retry returns complete counts", async () => {
  const count = 1_000_000;
  let reads = 0;
  const item = {
    get net() {
      reads++;
      return 0;
    },
  };
  const scene = {
    nets: new Map(),
    segments: new Array(count).fill(item),
    vias: [],
    pins: [],
    zones: [],
  } as unknown as BoardScene;
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(
      BoardSearchIndex.buildItemsAsync(scene, controller.signal),
    ).rejects.toMatchObject({
      name: "AbortError",
    });
  } finally {
    clearTimeout(timer);
  }
  expect(reads > 0 && reads < count).toBeTruthy();
  const atCancel = reads;
  await expect(
    BoardSearchIndex.buildItemsAsync(scene, controller.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(reads).toBe(atCancel);
  const retry = await BoardSearchIndex.buildItemsAsync({
    ...scene,
    segments: [{ net: 3 }, { net: 3 }] as BoardScene["segments"],
  });
  expect(retry).toStrictEqual([{ kind: "net", id: 3, name: "3", count: 2 }]);
});
