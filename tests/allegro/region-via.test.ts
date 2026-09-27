import { test, expect } from "vitest";

import type { Raw } from "../../src/lib/allegro/binary/reader";
import { AllegroPadstackResolver } from "../../src/lib/allegro/decoders/padstack";

// Native camera_test_board: (10.6848,-1.6366) and (10.287,-3.175) mm,
// ZONE_2, VIA12R5, TOP--BOTTOM, plated .127 mm. The latter connects copper
// on all four physical layers, independently of the selected stackup view.
function fixture() {
  const stack: Raw = {
    type: 28,
    Key: 640,
    StartLayer: 0,
    LayerCount: 4,
    PadType: 4,
    Plated: true,
    DrillSize: 1270,
    SlotX: 0,
    SlotY: 0,
  };
  const wrapper: Raw = {
    type: 47,
    Type: 0,
    T2: 0,
    UnknownArray: [640, 115697, 0x20004, 0, 0, 64],
  };
  const map = new Map([
    [640, stack],
    [115696, wrapper],
  ]);
  return {
    stack,
    wrapper,
    resolve: () =>
      new AllegroPadstackResolver((id) => map.get(id), 4, 172).resolveVia(
        115696,
        115697,
      ),
  };
}
test("regional through-via reference retains the full physical span and region code", () => {
  const { stack, resolve } = fixture(),
    value = resolve()!;
  expect(value.stack).toBe(stack);
  expect(value.stack.StartLayer).toBe(0);
  expect(value.stack.LayerCount).toBe(4);
  expect(value.stack.DrillSize).toBe(1270);
  expect(value.regionCode).toBe(2);
  expect(value.backdrill).toBe(undefined);
});
test("regional reference rejects mismatched owners, geometry variants and layer counts", () => {
  for (const [index, value] of [
    [0, 999],
    [1, 123],
    [2, 4],
    [2, 0x20003],
    [2, 0x100000000],
    [3, 1],
    [4, 1],
    [5, 96],
  ]) {
    const f = fixture();
    f.wrapper.UnknownArray[index] = value;
    expect(f.resolve()).toBe(undefined);
  }
  for (const [field, value] of Object.entries({
    StartLayer: 1,
    LayerCount: 3,
    PadType: 26,
    Plated: false,
    DrillSize: 0,
    SlotX: 1,
    SlotY: 1,
  })) {
    const f = fixture();
    f.stack[field] = value;
    expect(f.resolve()).toBe(undefined);
  }
  const f = fixture();
  f.wrapper.T2 = 256;
  expect(f.resolve()).toBe(undefined);
});
