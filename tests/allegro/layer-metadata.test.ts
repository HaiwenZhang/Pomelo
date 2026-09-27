import { test, expect } from "vitest";

import { AllegroLayerDecoder } from "../../src/lib/allegro/decoders/layers";

test("IRIS physical layer flags distinguish conductors and named dielectrics", () => {
  expect(AllegroLayerDecoder.functionFromFlags(0x88000)).toBe("conductor");
  expect(AllegroLayerDecoder.functionFromFlags(0x108000)).toBe("conductor");
  expect(AllegroLayerDecoder.functionFromFlags(0x8000)).toBe("conductor");
  expect(AllegroLayerDecoder.functionFromFlags(0x4000)).toBe("dielectric");
});

test("plane type is independent of surface and legacy property bits", () => {
  for (const flags of [0x100, 0x100100, 0x903])
    expect(AllegroLayerDecoder.functionFromFlags(flags)).toBe("plane");
  for (const flags of [0x88001, 0x108002, 0x8003])
    expect(AllegroLayerDecoder.functionFromFlags(flags)).toBe("conductor");
});

test("missing or conflicting type bits remain unknown without guessing", () => {
  for (const flags of [undefined, 0, 3, 0x80000, 0xc000, 0x8100, 0x4100])
    expect(AllegroLayerDecoder.functionFromFlags(flags)).toBe("unknown");
  expect(
    AllegroLayerDecoder.summary([
      { layerFunction: "conductor" },
      { layerFunction: "plane" },
      { layerFunction: "dielectric" },
      {},
    ]),
  ).toBe("1 导体层 · 1 平面层 · 1 介质层 · 1 未分类层");
});
