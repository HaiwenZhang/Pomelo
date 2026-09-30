import { test, expect } from "vitest";
import type { BrdDatabase } from "../../src/lib/allegro/database";
import { AllegroLayerDecoder } from "../../src/lib/allegro/decoders/layers";
import { AllegroTextBuilder } from "../../src/lib/allegro/scene/text";
import { AllegroTextRecordDecoder } from "../../src/lib/allegro/decoders/text-record";

import type { BoardText } from "../../src/lib/board/model";

import {
  BoardTextGlyphBuilder,
  glyphCorners,
} from "../../src/lib/text/board-text-glyph-builder";

const fixtureFont = {
  size: 42,
  range: 4,
  glyphs: { M: { uv: [0, 0, 1, 1], plane: [0, 0, 1, 0.733], advance: 1 } },
};

const metrics = {
  Height: 5000,
  Width: 3800,
  CharacterSpace: 1300,
  LineSpace: 6300,
  StrokeWidth: 1000,
};
const wrapper = {
  Key: 1,
  Layer: 6,
  Font: 65539,
  CoordsX: 108529,
  CoordsY: 6877,
  Rotation: 0,
};
const text = () =>
  new AllegroTextRecordDecoder(0.000254).decode(
    wrapper,
    { Value: "i.MX 8M MINI" },
    metrics,
  );

test("long single texts yield before expanding all glyphs, including whitespace-only runs", () => {
  for (const value of ["A".repeat(10000), " ".repeat(10000)]) {
    const steps = BoardTextGlyphBuilder.buildSteps({ ...text(), text: value });
    let strokes = 0;
    while (true) {
      const step = steps.next();
      expect(step.done).toBe(false);
      if (!step.value) break;
      strokes++;
    }
    expect(strokes).toBeLessThan(10000);
    steps.return(undefined);
    expect(steps.next().done).toBe(true);
  }
});

test("text properties preserve one-based font, signed coordinates, byte-coded alignment and reversal", () => {
  const t = text();
  expect(t.fontIndex).toBe(3);
  expect(t.align).toBe("left");
  expect(t.mirrored).toBe(false);
  expect(Math.abs(t.at[0] - 27.566366) < 1e-9).toBeTruthy();
  expect(t.height).toBe(1.27);
  expect(t.width).toBe(0.9652);
  expect(t.strokeWidth).toBe(0.254);
  const right = new AllegroTextRecordDecoder(1).decode(
    { ...wrapper, Font: 0x03020003, CoordsX: 0xfffffff0, Rotation: 90000 },
    { Value: "A" },
    metrics,
  );
  expect(right.at[0]).toBe(-16);
  expect(right.align).toBe("right");
  expect(right.mirrored).toBe(true);
  expect(Math.abs(right.angle - Math.PI / 2) < 1e-12).toBeTruthy();
  expect(
    new AllegroTextRecordDecoder(1).decode(
      { ...wrapper, Font: 0x00030003 },
      { Value: "A" },
      metrics,
    ).align,
  ).toBe("center");
});

test("text record decoder rejects malformed raw placement and content fields", () => {
  const decoder = new AllegroTextRecordDecoder(1);
  expect(() =>
    decoder.decode({ ...wrapper, CoordsX: "bad" }, { Value: "A" }, metrics),
  ).toThrow(/Invalid Allegro text record field/);
  expect(() => decoder.decode(wrapper, { Value: 42 }, metrics)).toThrow(
    /Invalid Allegro text record field/,
  );
});

test("only board and placed-footprint text chains become visible objects", async () => {
  const records = new Map<number, any>([
    [1, { ...wrapper, type: 48, Next: 2, StrGraphicPtr: 4 }],
    [2, { type: 3, Key: 2, Next: 9 }],
    [3, { ...wrapper, type: 48, Key: 3, Next: 99, StrGraphicPtr: 4 }],
    [4, { type: 49, Value: "M" }],
    [5, { ...wrapper, type: 48, Key: 5, Next: 0, StrGraphicPtr: 4 }], // library-only text, not placed
  ]);
  const db = {
    header: { textList: { head: 1, tail: 9 } },
    get: (id: number) => records.get(id),
    *records(type: number) {
      if (type === 54) yield { Code: 8, Fonts: [metrics, metrics, metrics] };
      if (type === 45) yield { Key: 99, TextPtr: 3 };
    },
  } as unknown as BrdDatabase;
  const diagnostics: string[] = [];
  const result = await new AllegroTextBuilder(db, 1).build(diagnostics);
  expect(result.texts.map((t) => t.id)).toStrictEqual([1, 3]);
  expect(diagnostics).toStrictEqual([]);
  records.get(2).Next = 1;
  await expect(
    Promise.resolve().then(() => new AllegroTextBuilder(db, 1).build([])),
  ).rejects.toThrow(/text chain loops/);
});

test("text layers distinguish copper from separately visible silk and assembly", () => {
  expect(text().layer).toBe(0);
  expect(AllegroLayerDecoder.drawingLayer(0xfb0d).defaultVisible).toBe(true);
  expect(AllegroLayerDecoder.drawingLayer(0xfa0d).defaultVisible).toBe(false);
  expect(AllegroLayerDecoder.drawingLayer(0xfd0d).defaultVisible).toBe(false);
  expect(AllegroLayerDecoder.drawingLayer(0xfb0d).id).not.toBe(0);
});

test("modern text chains accept other declared header tails but still diagnose missing references", async () => {
  const records = new Map<number, any>([
    [1, { ...wrapper, type: 48, Next: 111, StrGraphicPtr: 4 }],
    [4, { type: 49, Value: "M" }],
  ]);
  const db = {
    header: { textList: { head: 1, tail: 112 }, sentinelKeys: [111, 112] },
    get: (id: number) => records.get(id),
    *records(type: number) {
      if (type === 54) yield { Code: 8, Fonts: [metrics, metrics, metrics] };
    },
  } as unknown as BrdDatabase;
  const diagnostics: string[] = [];
  expect(
    (await new AllegroTextBuilder(db, 1).build(diagnostics)).texts.length,
  ).toBe(1);
  expect(diagnostics).toStrictEqual([]);
  records.get(1).Next = 113;
  await new AllegroTextBuilder(db, 1).build(diagnostics);
  expect(diagnostics).toStrictEqual(["文字链缺失引用 113"]);
});

test("MSDF text keeps physical cell width, spacing, justification, rotation and mirror", () => {
  const t: BoardText = {
    ...text(),
    text: "MM",
    at: [0, 0],
    width: 2,
    height: 3,
    spacing: 0.5,
    strokeWidth: 0.1,
  };
  const base = BoardTextGlyphBuilder.build(t, fixtureFont),
    points = base.flatMap(glyphCorners);
  expect(Math.min(...points.map((p) => p[0]))).toBe(0);
  expect(Math.max(...points.map((p) => p[0]))).toBe(4.5);
  expect(Math.max(...points.map((p) => p[1]))).toBe(3);
  expect(
    base.every((s) => s.values.length === 16 && s.page === 0),
  ).toBeTruthy();
  const mirrored = BoardTextGlyphBuilder.build(
      { ...t, mirrored: true },
      fixtureFont,
    ),
    rotated = BoardTextGlyphBuilder.build(
      { ...t, angle: Math.PI / 2 },
      fixtureFont,
    );
  for (let i = 0; i < base.length; i++) {
    expect(
      Math.abs(mirrored[i].values[0] + base[i].values[0]) < 1e-12,
    ).toBeTruthy();
    expect(
      Math.abs(rotated[i].values[0] + base[i].values[1]) < 1e-12,
    ).toBeTruthy();
    expect(
      Math.abs(rotated[i].values[1] - base[i].values[0]) < 1e-12,
    ).toBeTruthy();
  }
  const right = BoardTextGlyphBuilder.build(
    { ...t, align: "right" },
    fixtureFont,
  );
  expect(right[0].values[0]).toBe(base[0].values[0] - 4.5);
});

test("multiline MSDF text uses the BRD line pitch", () => {
  const t = {
    ...text(),
    text: "M\nM",
    at: [0, 0] as [number, number],
    lineSpacing: 4,
  };
  const strokes = BoardTextGlyphBuilder.build(t, fixtureFont),
    n = strokes.length / 2;
  expect(strokes[n].values[1]).toBe(strokes[0].values[1] - 4);
});

test("existing zero-size text blocks preserve placed objects and layer metadata", async () => {
  const zero = {
    Height: 0,
    Width: 0,
    CharacterSpace: 0,
    LineSpace: 0,
    StrokeWidth: 0,
  };
  const records = new Map<number, any>([
    [
      1,
      {
        ...wrapper,
        type: 48,
        Layer: 0xfd02,
        Font: 32,
        Next: 9,
        StrGraphicPtr: 4,
        CoordsX: 709,
        CoordsY: 0xfffff677,
        Rotation: 90000,
      },
    ],
    [4, { type: 49, Value: "RK3576" }],
  ]);
  const fonts = Array.from({ length: 32 }, () => metrics);
  fonts[31] = zero;
  const db = {
    header: { textList: { head: 1, tail: 9 } },
    get: (id: number) => records.get(id),
    *records(type: number) {
      if (type === 54) yield { Code: 8, Fonts: fonts };
    },
  } as unknown as BrdDatabase;
  const diagnostics: string[] = [];
  const result = await new AllegroTextBuilder(db, 0.0000254).build(diagnostics);
  expect(diagnostics).toStrictEqual([]);
  expect(result.texts.length).toBe(1);
  const t = result.texts[0];
  expect(t.text).toBe("RK3576");
  expect(t.fontIndex).toBe(32);
  expect(t.width).toBe(0);
  expect(t.height).toBe(0);
  expect(t.at).toStrictEqual([709 * 0.0000254, -2441 * 0.0000254]);
  expect(t.classId).toBe(2);
  expect(t.subclass).toBe(253);
  expect(result.drawingLayers[0].id).toBe(t.layer);
  expect(BoardTextGlyphBuilder.build(t, fixtureFont)).toStrictEqual([]);
  // Missing fonts and partially zero dimensions remain diagnosed, not given a
  // default font or mistaken for the verified all-zero definition.
  fonts.pop();
  expect(
    (await new AllegroTextBuilder(db, 1).build(diagnostics)).texts.length,
  ).toBe(0);
  fonts.push({ ...zero, Width: 1 });
  expect(
    (await new AllegroTextBuilder(db, 1).build(diagnostics)).texts.length,
  ).toBe(0);
  fonts[31] = { ...zero, StrokeWidth: 1 };
  expect(
    (await new AllegroTextBuilder(db, 1).build(diagnostics)).texts.length,
  ).toBe(0);
  expect(diagnostics.length).toBe(3);
});

test("zero-sized glyphs never become GPU hairline dots while normal hairline text remains drawable", () => {
  for (const angle of [0, Math.PI / 2, Math.PI])
    for (const mirrored of [false, true]) {
      const t = {
        ...text(),
        text: "RK3576\nU1000",
        angle,
        mirrored,
        width: 0,
        height: 0,
        spacing: 0,
        lineSpacing: 0,
        strokeWidth: 0,
      };
      expect(BoardTextGlyphBuilder.build(t, fixtureFont)).toStrictEqual([]);
    }
  const strokes = BoardTextGlyphBuilder.build({ ...text(), strokeWidth: 0 });
  expect(strokes.length > 0).toBeTruthy();
  expect(strokes.every((s) => s.values.length === 16)).toBeTruthy();
});
