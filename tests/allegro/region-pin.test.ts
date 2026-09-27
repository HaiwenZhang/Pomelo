import { test, expect } from "vitest";

import type { Raw } from "../../src/lib/allegro/binary/reader";
import { AllegroPadstackResolver } from "../../src/lib/allegro/decoders/padstack";

// Native camera P1.MTB4: ZONE_2, TOP only, surface pin, no drill.
function fixture() {
  const stack: Raw = {
    type: 28,
    Key: 646,
    StartLayer: 0,
    LayerCount: 1,
    PadType: 10,
    Plated: false,
    DrillSize: 0,
    SlotX: 0,
    SlotY: 0,
  };
  const wrapper: Raw = {
    type: 47,
    Type: 0,
    T2: 0,
    UnknownArray: [646, 7184, 0x20001, 0, 0, 64],
  };
  const map = new Map([
    [646, stack],
    [30508, wrapper],
  ]);
  return {
    stack,
    wrapper,
    resolve: (version = 172) =>
      new AllegroPadstackResolver((id) => map.get(id), 4, version).resolvePin(
        30508,
        7184,
      ),
  };
}
test("regional surface pin uses its absolute physical layer and retains its region", () => {
  const f = fixture();
  expect(f.resolve()).toStrictEqual({
    stack: f.stack,
    embeddedLayer: 0,
    regionCode: 2,
  });
  expect(f.resolve(166)).toBe(undefined);
});
test("regional pin rejects mismatched owner, through-hole, die and unknown variants", () => {
  for (const [index, value] of [
    [0, 999],
    [1, 123],
    [2, 1],
    [2, 0x20004],
    [2, 0x100000000],
    [3, 1],
    [4, 1],
    [5, 8],
  ]) {
    const f = fixture();
    f.wrapper.UnknownArray[index] = value;
    expect(f.resolve()).toBe(undefined);
  }
  for (const [field, value] of Object.entries({
    StartLayer: 1,
    LayerCount: 4,
    PadType: 26,
    Plated: true,
    DrillSize: 1270,
    SlotX: 1,
    SlotY: 1,
  })) {
    const f = fixture();
    f.stack[field] = value;
    expect(f.resolve()).toBe(undefined);
  }
  const f = fixture();
  f.wrapper.T2 = 0xfc00;
  expect(f.resolve()).toBe(undefined);
});
