import { test, expect, vi } from "vitest";

import { BrdDatabase } from "../../src/lib/allegro/database";
import { AllegroGeometryDecoder } from "../../src/lib/allegro/decoders/geometry";
import { AllegroPadDecoder } from "../../src/lib/allegro/decoders/pad";
import type { Point, Segment } from "../../src/lib/board/model";
import { PadShape as PadGeometry } from "../../src/lib/board/shapes/pad";

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

test("custom pad dimensions preserve source values and only derive missing dimensions", () => {
  const geometry = new AllegroGeometryDecoder(database, 1);
  const corners: Point[] = [
    [0, 0],
    [2, 0],
    [2, 3],
    [0, 3],
  ];
  const path: Segment[] = corners.map((a, i) => ({
    id: i,
    trackId: 0,
    layer: -1,
    net: 0,
    width: 0,
    a,
    b: corners[(i + 1) % corners.length],
  }));
  const read = vi.spyOn(geometry, "readShapePaths").mockReturnValue([path]);
  const bounds = vi.spyOn(PadGeometry.prototype, "bounds");
  try {
    const diagnostics: string[] = [];
    const decoder = new AllegroPadDecoder(geometry, 1, diagnostics);
    const source = { Type: 22, W: 10, H: 20, ShapePtr: 7 };
    const stored = decoder.shape(source, 0, [3, 4], 10)!;
    expect([stored.width, stored.height]).toStrictEqual([10, 20]);
    expect(bounds).not.toHaveBeenCalled();
    const inferred = decoder.shape({ ...source, W: 0, H: 0 }, 1, [3, 4], 10)!;
    expect([inferred.width, inferred.height]).toStrictEqual([2, 3]);
    expect(bounds).toHaveBeenCalledTimes(1);
    expect(inferred.custom).toBe(stored.custom);
    expect(inferred.customPaths).toBe(stored.customPaths);
    expect(read).toHaveBeenCalledTimes(1);
    expect(diagnostics).toStrictEqual([]);
  } finally {
    bounds.mockRestore();
    read.mockRestore();
  }
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
