import { test, expect } from "vitest";

import type { BrdDatabase } from "../../src/lib/allegro/database";
import { AllegroSceneBuilder } from "../../src/lib/allegro/scene-builder";

function networkDatabase(count: number) {
  let reads = 0;
  const track = { type: 5, Key: 4, Next: 2, Layer: 6, FirstSegPtr: 5 };
  const db = {
    header: {
      units: 3,
      divisor: 1000,
      version: 175,
      layerMap: { 6: { recordId: 1 } },
      textList: { head: 0, tail: 0 },
    },
    strings: new Map([[9, "GND"]]),
    get(id: number) {
      if (id === 1) return { type: 0x2a, Entries: [{ Name: "TOP" }] };
      if (id === 4) return track;
      if (id === 5)
        return {
          type: 21,
          Key: 5,
          Next: 4,
          StartX: 0,
          StartY: 0,
          EndX: 1000,
          EndY: 0,
          Width: 200,
        };
      if (id >= 100 && id < 100 + count) {
        reads++;
        return { type: 0x33, Key: id, Next: id === 99 + count ? 4 : id + 1 };
      }
    },
    *records(type: number) {
      if (type === 0x1b) yield { Key: 3, NetName: 9 };
      if (type === 4) yield { Key: 2, ConnItem: count ? 100 : 4, Net: 3 };
      if (type === 5) yield track;
    },
  } as unknown as BrdDatabase;
  return { db, reads: () => reads };
}

test("a single huge network yields and cancels before its connection chain is fully read", async () => {
  const source = networkDatabase(1_000_000),
    controller = new AbortController();
  let phase = "",
    abortedPhase = "",
    timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await expect(
      new AllegroSceneBuilder(source.db).build(controller.signal, (p) => {
        phase = p;
        if (p === "解析网络连接" && !timer)
          timer = setTimeout(() => {
            abortedPhase = phase;
            controller.abort();
          }, 0);
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(abortedPhase).toBe("解析网络连接");
    expect(source.reads() > 0 && source.reads() < 1_000_000).toBeTruthy();
  } finally {
    clearTimeout(timer);
  }
  const retry = await new AllegroSceneBuilder(networkDatabase(10).db).build();
  expect(retry.segments.length).toBe(1);
  expect(retry.segments[0].net).toBe(3);
  expect(retry.nets.get(3)).toBe("GND");
});

test("non-displayed shape records yield and cancel inside the copper stage", async () => {
  const source = networkDatabase(0),
    records = source.db.records;
  let reads = 0,
    phase = "",
    abortedPhase = "",
    timer: ReturnType<typeof setTimeout> | undefined;
  source.db.records = function* (type: number) {
    if (type === 40) {
      for (let i = 0; i < 1_000_000; i++) {
        reads++;
        yield { type: 40, Key: 100 + i, Layer: 9 };
      }
    } else yield* records.call(source.db, type);
  };
  const controller = new AbortController();
  try {
    await expect(
      new AllegroSceneBuilder(source.db).build(controller.signal, (p) => {
        phase = p;
        if (p === "构建铜皮" && !timer)
          timer = setTimeout(() => {
            abortedPhase = phase;
            controller.abort();
          }, 0);
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(abortedPhase).toBe("构建铜皮");
    expect(reads > 0 && reads < 1_000_000).toBeTruthy();
  } finally {
    clearTimeout(timer);
  }
  const retry = await new AllegroSceneBuilder(networkDatabase(0).db).build();
  expect(retry.segments.length).toBe(1);
  expect(retry.zones.length).toBe(0);
  expect(retry.diagnostics).toStrictEqual([]);
});
