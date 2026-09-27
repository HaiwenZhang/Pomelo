import { test, expect } from "vitest";
import { AllegroDrillDecoder } from "../../src/lib/allegro/decoders/drill";

test("v17 slot envelope takes precedence over tool diameter and follows pad orientation", () => {
  const components = Array.from({ length: 25 }, () => ({ W: 0, H: 0 }));
  components[23] = { W: 7, H: 3 };
  const stack = {
    DrillSize: 1,
    SlotX: 2,
    SlotY: 5,
    Flags: 0x20,
    Components: components,
  };
  expect(new AllegroDrillDecoder(0.1).decode(stack)).toStrictEqual({
    width: 0.5,
    height: 0.2,
    plated: true,
  });
  components[23] = { W: 3, H: 7 };
  expect(new AllegroDrillDecoder(0.1).decode(stack)).toStrictEqual({
    width: 0.2,
    height: 0.5,
    plated: true,
  });
  expect(
    new AllegroDrillDecoder(0.1).decode({ ...stack, SlotY: 0, Flags: 0 }),
  ).toStrictEqual({
    width: 0.1,
    height: 0.1,
    plated: false,
  });
});

test("v16 slot orientation uses old copper slots and decoded plating instead of v17 flag bits", () => {
  const components = Array.from({ length: 17 }, () => ({ W: 0, H: 0 }));
  components[13] = { W: 7, H: 3 };
  const stack = {
    DrillSize: 1,
    SlotX: 2,
    SlotY: 5,
    Flags: 1,
    Plated: true,
    NumFixedCompEntries: 11,
    Components: components,
  };
  expect(new AllegroDrillDecoder(0.1).decode(stack)).toStrictEqual({
    width: 0.5,
    height: 0.2,
    plated: true,
  });
  expect(
    new AllegroDrillDecoder(1).decode({ ...stack, Plated: false, Flags: 0x20 })
      .plated,
  ).toBe(false);
});
