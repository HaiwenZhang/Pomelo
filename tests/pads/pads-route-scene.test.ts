import { test, expect } from "vitest";

import { buildPadsRouteSegments } from "../../src/lib/pads/scene/route-scene";
import { importPads } from "../../src/lib/pads/import";
import type { PadsLayer } from "../../src/lib/pads/binary/metadata";
import type { PadsRoute } from "../../src/lib/pads/binary/routes";
const layers = [
  { id: 1, type: 1 },
  { id: 7, type: 3 },
  { id: 9, type: 1 },
] as PadsLayer[];
const route: PadsRoute = {
  object: 3,
  handle: 99,
  layer: 9,
  net: 0,
  width: 0.2,
  style: 0,
  points: [
    [1, 2],
    [3, 2],
    [3, 2],
    [3, 4],
  ],
};
test("PADS route scene maps sparse source layers, keeps grouping and reserves net zero", async () => {
  const segments = await buildPadsRouteSegments([route], layers);
  expect(segments.length).toBe(2);
  expect(segments.map((s) => s.layer)).toStrictEqual([1, 1]);
  expect(segments.map((s) => s.net)).toStrictEqual([1, 1]);
  expect(segments[0].trackId).toBe(segments[1].trackId);
  expect(segments[0].id).not.toBe(segments[1].id);
  expect(segments[1].a).toStrictEqual([3, 2]);
  expect(segments[1].b).toStrictEqual([3, 4]);
  await expect(
    buildPadsRouteSegments([{ ...route, layer: 7 }], layers),
  ).rejects.toThrow(/属性无效/);
  await expect(buildPadsRouteSegments([route, route], layers)).rejects.toThrow(
    /重复/,
  );
});
test("PADS integration honours pre-abort before reading or publishing a partial scene", async () => {
  const c = new AbortController();
  c.abort();
  await expect(importPads(new ArrayBuffer(0), c.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
  await expect(
    buildPadsRouteSegments([route], layers, c.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
});
