import { test, expect } from "vitest";
import type { Raw } from "../../src/lib/allegro/binary/reader";
import { AllegroPadstackResolver } from "../../src/lib/allegro/decoders/padstack";

test("embedded pad resolves its reference stack and absolute inner layer", () => {
  const stack = { type: 28, Key: 12176, LayerCount: 1, DrillSize: 0, SlotY: 0 },
    wrapper = {
      type: 47,
      Type: 0,
      T2: 768,
      UnknownArray: [12176, 197976, 1, 0, 0, 16],
    };
  const records = new Map<number, Raw>([
      [12176, stack],
      [197927, wrapper],
    ]),
    get = (id: number) => records.get(id);
  expect(
    new AllegroPadstackResolver(get, 10, undefined).resolvePin(197927, 197976),
  ).toStrictEqual({
    stack,
    embeddedLayer: 3,
  });
  expect(
    new AllegroPadstackResolver(get, 10, undefined).resolvePin(12176, 197976),
  ).toStrictEqual({
    stack,
  });
  expect(
    new AllegroPadstackResolver(get, 10, undefined).resolvePin(197927, 1),
  ).toBe(undefined);
  expect(
    new AllegroPadstackResolver(get, 3, undefined).resolvePin(197927, 197976),
  ).toBe(undefined);
  wrapper.UnknownArray[5] = 17;
  expect(
    new AllegroPadstackResolver(get, 10, undefined).resolvePin(197927, 197976),
  ).toBe(undefined);
  wrapper.UnknownArray[5] = 16;
  stack.LayerCount = 2;
  expect(
    new AllegroPadstackResolver(get, 10, undefined).resolvePin(197927, 197976),
  ).toBe(undefined);
});

test("PA14611 embedded pad accepts nonzero opaque metadata without following it as geometry", () => {
  const stack = { type: 28, Key: 16067, LayerCount: 1, DrillSize: 0, SlotY: 0 };
  const wrapper = {
    type: 47,
    Type: 0,
    T2: 512,
    UnknownArray: [16067, 106273, 1, 146877, 0, 16],
  };
  // In this file the opaque word happens to match an unrelated arc record.
  const unrelated = { type: 1, Key: 146877, StartX: 1161852 };
  const records = new Map<number, Raw>([
    [16067, stack],
    [178900, wrapper],
    [146877, unrelated],
  ]);
  const get = (id: number) => records.get(id);
  expect(
    new AllegroPadstackResolver(get, 8, undefined).resolvePin(178900, 106273),
  ).toStrictEqual({
    stack,
    embeddedLayer: 2,
  });
  records.delete(146877);
  expect(
    new AllegroPadstackResolver(get, 8, undefined).resolvePin(178900, 106273),
  ).toStrictEqual({
    stack,
    embeddedLayer: 2,
  });
  expect(
    new AllegroPadstackResolver(get, 8, undefined).resolvePin(178900, 75792),
  ).toBe(undefined);
  wrapper.UnknownArray[4] = 1;
  expect(
    new AllegroPadstackResolver(get, 8, undefined).resolvePin(178900, 106273),
  ).toBe(undefined);
});
