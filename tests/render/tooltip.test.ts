import { test, expect } from "vitest";
import type { BoardScene } from "../../src/lib/board/model";
import type { Segment } from "../../src/lib/board/model";

import { hoverDetails } from "../../src/lib/interaction/hover-details";
import { BoardIndex, type PickHit } from "../../src/lib/interaction/picking";

test("hover details distinguish physical span, source padstack, arc length and net routed length", async () => {
  const segments: Segment[] = [
    { id: 1, trackId: 1, net: 1, layer: 0, a: [0, 0], b: [3, 4], width: 0.2 },
    {
      id: 2,
      trackId: 2,
      net: 1,
      layer: 0,
      a: [1, 0],
      b: [0, 1],
      width: 0.2,
      arc: { center: [0, 0], radius: 1, start: 0, sweep: Math.PI / 2 },
    },
  ];
  const scene: BoardScene = {
    layers: [
      { id: 0, name: "Top", color: "#ff0000" },
      { id: 1, name: "Bottom", color: "#0000ff" },
    ],
    nets: new Map([[1, "VPH_PWR"]]),
    segments,
    vias: [],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    diagnostics: [],
  };
  const index = new BoardIndex(scene),
    hit: PickHit = {
      object: { kind: "segment", value: segments[0] },
      layer: 0,
      category: "etch",
      distance: 0,
    };
  const signal = new AbortController().signal;
  expect(
    (await hoverDetails(scene, index, hit, "object", signal)).includes(
      "Length: 5.0000 mm",
    ),
  ).toBeTruthy();
  expect(
    (await hoverDetails(scene, index, hit, "net", signal)).includes(
      "Routed length: 6.5708 mm",
    ),
  ).toBeTruthy();
  expect(
    (await hoverDetails(scene, index, hit, "track", signal)).includes(
      "Routed length: 5.0000 mm",
    ),
  ).toBeTruthy();
  const via: PickHit = {
    ...hit,
    object: {
      kind: "via",
      value: {
        id: 3,
        net: 1,
        at: [152.7681, 21.0866],
        padstack: 16095,
        padstackName: "TEST_PAD",
        drill: 0.2,
        startLayer: 0,
        endLayer: 1,
        pads: [],
      },
    },
  };
  const detail = await hoverDetails(scene, index, via, "object", signal);
  expect(detail[0]).toBe("Via - Padstack: TEST_PAD");
  expect(detail[3].includes("Top : Bottom")).toBeTruthy();
  const aborted = new AbortController();
  aborted.abort();
  await expect(
    hoverDetails(scene, index, hit, "net", aborted.signal),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
});
