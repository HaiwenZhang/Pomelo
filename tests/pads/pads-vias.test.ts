import { test, expect } from "vitest";

import { buildPadsVias, padsViaSpan } from "../../src/lib/pads/scene/vias";
import type { PadsLayer } from "../../src/lib/pads/binary/metadata";
import type { PadsPadstack } from "../../src/lib/pads/binary/padstack";
const layers = [1, 2, 3, 4].map((id) => ({ id, type: 1 })) as PadsLayer[];
test("PADS explicit Via span is normalized and invalid spans never become through holes", () => {
  expect(padsViaSpan({ drillStart: 0, drillEnd: 0 }, layers)).toStrictEqual([
    0, 3,
  ]);
  expect(padsViaSpan({ drillStart: 3, drillEnd: 2 }, layers)).toStrictEqual([
    1, 2,
  ]);
  expect(() => padsViaSpan({ drillStart: 0, drillEnd: 3 }, layers)).toThrow(
    /跨度无效/,
  );
  expect(() => padsViaSpan({ drillStart: 5, drillEnd: 2 }, layers)).toThrow(
    /跨度无效/,
  );
});
test("PADS coincident stacked vias remain distinct while identical carriers retain aliases", async () => {
  const a = {
    index: 0,
    active: true,
    sourceOffset: 0,
    width: 1,
    drill: 0.4,
    shapeCode: 2,
    fingerLength: 0,
    fingerOffset: 0,
    angle: 0,
    drillStart: 1,
    drillEnd: 2,
    slotLength: 0,
    slotAngle: 0,
    plated: true,
    layers: [],
  } satisfies PadsPadstack;
  const junction = {
    junction: 10,
    sourceOffset: 0,
    rawAt: [100, 200] as [number, number],
    at: [1, 2] as [number, number],
    definition: 0,
    padstack: 0,
    rawNet: 0,
    relationshipNet: 0,
    headBytes: [],
  };
  const result = await buildPadsVias({
    version: 0x2026,
    layers,
    stacks: [a, { ...a, index: 1, drillStart: 2, drillEnd: 4 }],
    footprints: [],
    junctions: [
      junction,
      { ...junction, junction: 11 },
      { ...junction, junction: 12, padstack: 1 },
    ],
  });
  expect(result.vias.length).toBe(2);
  expect(result.vias.map((v) => v.pads.map((p) => p.layer))).toStrictEqual([
    [0, 1],
    [1, 2, 3],
  ]);
  expect(result.vias[0].net).toBe(1);
  expect(result.aliases).toStrictEqual([
    { source: 0x3c00000b, target: 0x3c00000a },
  ]);
  const surface = {
    ...a,
    width: 0,
    drill: 0,
    plated: undefined,
    drillStart: 0,
    drillEnd: 0,
    layers: [
      {
        selector: 255,
        rawSelector: 0,
        shapeCode: 2,
        width: 1.5,
        second: 0,
        sourceOffset: 0,
        metadataOffset: 0,
        shapeOffset: 1,
      },
    ],
  };
  const noHole = await buildPadsVias({
    version: 0x2026,
    layers,
    stacks: [surface],
    footprints: [],
    junctions: [junction],
  });
  expect(noHole.vias[0].drillShape).toBe(undefined);
  expect(noHole.vias[0].drill).toBe(0);
  expect([noHole.vias[0].startLayer, noHole.vias[0].endLayer]).toStrictEqual([
    3, 3,
  ]);
  const abort = new AbortController();
  abort.abort();
  await expect(
    buildPadsVias(
      { version: 0x2026, layers, stacks: [], footprints: [], junctions: [] },
      abort.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
});
