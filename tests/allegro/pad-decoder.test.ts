import { test, expect } from "vitest";

import { BrdDatabase } from "../../src/lib/allegro/database";
import { AllegroGeometryDecoder } from "../../src/lib/allegro/decoders/geometry";
import { AllegroPadDecoder } from "../../src/lib/allegro/decoders/pad";

const database = new BrdDatabase(
  new ArrayBuffer(0),
  {
    magic: 0,
    version: 174,
    writerVersion: "",
    objectCount: 0,
    units: 3,
    divisor: 1,
    stringCount: 0,
    constraintEnd: 0,
    layerMap: [],
    textList: { head: 0, tail: 0 },
  },
  new Map(),
);

test("pad decoder owns shared drill definitions without sharing units across builds", () => {
  const first = new AllegroPadDecoder(
    new AllegroGeometryDecoder(database, 1),
    1,
    [],
  );
  const second = new AllegroPadDecoder(
    new AllegroGeometryDecoder(database, 0.1),
    0.1,
    [],
  );
  const stack = {
    Key: 10,
    DrillSize: 2,
    SlotX: 0,
    SlotY: 0,
    Flags: 0x20,
    Components: [],
  };
  expect(first.drill(stack)).toBe(first.drill(stack));
  expect(first.drill(stack)).toStrictEqual({
    width: 2,
    height: 2,
    plated: true,
  });
  expect(second.drill(stack)).toStrictEqual({
    width: 0.2,
    height: 0.2,
    plated: true,
  });
  expect(first.drill(stack)).not.toBe(second.drill(stack));
});

test("pad decoder keeps empty rectangles absent and deduplicates invalid donut diagnostics", () => {
  const diagnostics: string[] = [];
  const decoder = new AllegroPadDecoder(
    new AllegroGeometryDecoder(database, 1),
    1,
    diagnostics,
  );
  expect(decoder.shape({ Type: 6, W: 0, H: 3 }, 0, [0, 0], 10)).toBe(null);
  expect(diagnostics).toStrictEqual([]);
  const invalid = { Type: 25, W: 2, H: 2, Z1: 3 };
  expect(decoder.shape(invalid, 0, [0, 0], 10)).toBe(null);
  expect(decoder.shape(invalid, 0, [0, 0], 10)).toBe(null);
  expect(diagnostics).toStrictEqual(["Padstack 10 的圆环内外径无效"]);
});

test("pad decoder rejects incomplete raw shape fields with a diagnostic", () => {
  const diagnostics: string[] = [];
  const decoder = new AllegroPadDecoder(
    new AllegroGeometryDecoder(database, 1),
    1,
    diagnostics,
  );
  expect(decoder.shape({ Type: 22, W: 2, H: 2 }, 0, [0, 0], 10)).toBe(null);
  expect(diagnostics).toStrictEqual(["Padstack 10 的焊盘类型 22 缺少形状引用"]);
});

test("pad decoder rejects malformed drill fields before caching a definition", () => {
  const decoder = new AllegroPadDecoder(
    new AllegroGeometryDecoder(database, 1),
    1,
    [],
  );
  expect(() =>
    decoder.drill({
      Key: 11,
      DrillSize: "2",
      SlotX: 0,
      SlotY: 0,
      Flags: 0,
      Components: [],
    }),
  ).toThrow(/Padstack 11 has an invalid drill field/);
  expect(
    decoder.drill({
      Key: 11,
      DrillSize: 2,
      SlotX: 0,
      SlotY: 0,
      Flags: 0,
      Components: [],
    }),
  ).toStrictEqual({ width: 2, height: 2, plated: false });
});
