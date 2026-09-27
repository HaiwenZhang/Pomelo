import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene, Via } from "../../src/lib/board/model";
import { ViaShape } from "../../src/lib/board/shapes/via";

import { Camera } from "../../src/lib/interaction/camera";
import { BoardIndex, selectionScene } from "../../src/lib/interaction/picking";
import {
  BoardLabelLayout,
  type FontAtlas,
} from "../../src/lib/render/board-label-layout";
import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";

const font: FontAtlas = {
  size: 128,
  range: 16,
  glyphs: Object.fromEntries(
    [..."?VPH_PWRGND12345678:"].map((c, i) => [
      c,
      { uv: [i / 32, 0, (i + 1) / 32, 1], plane: [0, 0, 0.6, 1], advance: 0.6 },
    ]),
  ),
};
const via = (
  id: number,
  start = 2,
  end = 5,
  at: [number, number] = [0, 0],
): Via => ({
  id,
  net: 1,
  at,
  padstack: id,
  drill: 0.2,
  startLayer: start,
  endLayer: end,
  pads: Array.from({ length: end - start + 1 }, (_, i) => ({
    layer: start + i,
    type: 2,
    width: 0.4,
    height: 0.4,
    offset: [0, 0],
  })),
});
const board = (vias: Via[]): BoardScene => ({
  layers: Array.from({ length: 8 }, (_, id) => ({
    id,
    name: `L${id + 1}`,
    color: "#00aaaa",
  })),
  nets: new Map([[1, "VPH_PWR"]]),
  vias,
  pins: [],
  segments: [],
  zones: [],
  outline: [],
  texts: [],
  drawingLayers: [],
  bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  diagnostics: [],
});
const camera = new Camera();
camera.scale = 1000;
const display = () => ({
  ...BoardDisplay.createDisplayOptions(),
  viaNames: false,
});
const labels = (s: BoardScene, o = display()) =>
  BoardLabelLayout.layout({
    scene: s,
    font,
    camera,
    width: 8000,
    height: 6000,
    options: o,
  }).get("drill") ?? [];
function decoded(data: number[]) {
  let text = "";
  for (let i = 0; i < data.length; i += 16)
    text += Object.entries(font.glyphs).find(
      ([, g]) => g.uv[0] === data[i + 4],
    )![0];
  return text;
}

test("BB spans use their own switch, retain source layer numbers and exclude pad-only/invalid spans", () => {
  const s = board([via(1), via(2, 0, 2, [1, 0]), via(3, 0, 7, [-1, 0])]);
  expect(decoded(labels(s))).toBe("3:61:31:8");
  expect(decoded(labels(s, { ...display(), bbLabels: false }))).toBe("1:8");
  expect(decoded(labels(s, { ...display(), thruLabels: false }))).toBe(
    "3:61:3",
  );
  expect(
    labels(s, { ...display(), bbLabels: false, thruLabels: false }).length,
  ).toBe(0);
  for (const v of [
    { ...via(4), drill: 0 },
    { ...via(5), endLayer: 2 },
    { ...via(6), endLayer: 8 },
    { ...via(7), startLayer: -1 },
  ])
    expect(labels(board([v])).length).toBe(0);
});

test("BB and through drill drawing, labels, picking and selection share Via-layer visibility", () => {
  const s = board([via(1), via(2, 0, 7, [2, 0])]),
    index = new BoardIndex(s),
    base = display();
  const batches = new PrimitiveBatchBuilder(s)
    .build()
    .filter((b) => b.category === "drill" && b.data.length);
  expect(batches.length).toBe(2);
  const bb = batches.find((b) => b.viaLayers?.length === 4)!,
    through = batches.find((b) => b.viaLayers?.length === 8)!;
  expect(bb.viaLayers).toStrictEqual([2, 3, 4, 5]);
  expect(through.viaLayers).toStrictEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  let o = { ...base, hidden: new Set([1, 2, 3, 4, 5, 6, 7]) }; // only Top, outside BB span
  expect(BoardDisplay.isBatchVisible(o, bb)).toBe(false);
  expect(BoardDisplay.isBatchVisible(o, through)).toBe(true);
  expect(index.pick([0, 0], 1000, o, "via")).toBe(null);
  expect(index.pick([2, 0], 1000, o, "via")?.object.value.id).toBe(2);
  expect(decoded(labels(s, o))).toBe("1:8");
  o = { ...base, hidden: new Set([0, 1, 2, 4, 5, 6, 7]) }; // only L4, inside BB span
  expect(BoardDisplay.isBatchVisible(o, bb)).toBe(true);
  expect(decoded(labels(s, o))).toBe("3:61:8");
  const hit = index.pick([0, 0], 1000, o, "via")!;
  expect(hit.category).toBe("drill");
  const subset = selectionScene(s, index.select(hit, "object").objects);
  const selected = [
    ...new PrimitiveBatchBuilder(subset).buildSteps({ kind: "selection" }),
  ].filter((b) => b?.category === "drill");
  expect(selected.length).toBeTruthy();
  expect(
    selected.every((b) => b && BoardDisplay.isBatchVisible(o, b, true)),
  ).toBeTruthy();
  o = BoardDisplay.setLayerVisibility(o, 3, "via", false);
  expect(index.pick([0, 0], 1000, o, "via")).toBe(null);
  expect(decoded(labels(s, o))).toBe("");
  expect(index.pick([2, 0], 1000, o, "via")).toBe(null);
  expect(BoardDisplay.isBatchVisible(o, through)).toBe(false);
  expect(
    selected.every((b) => b && !BoardDisplay.isBatchVisible(o, b, true)),
  ).toBeTruthy();
  expect(decoded(labels(s, { ...base, vias: false }))).toBe("");
  // The dedicated center switch does not change embedded-label controls.
  expect(decoded(labels(s, { ...base, drills: false }))).toBe("3:61:8");
  expect(
    batches.every(
      (b) => !BoardDisplay.isBatchVisible({ ...base, drills: false }, b),
    ),
  ).toBeTruthy();
  expect(new ViaShape(s.vias[1]).isThrough(8)).toBe(true);
  expect(new ViaShape(s.vias[0]).drillLayers(8)).toBe(
    new ViaShape({ ...s.vias[0], id: 99 }).drillLayers(8),
  );
});

test("BB span and net grow with the hole, separate into rows and restore after reverse zoom", () => {
  const s = board([via(1)]),
    o = { ...display(), viaNames: true },
    initial = labels(s, o);
  expect(decoded(initial)).toBe("3:6VPH_PWR");
  const span = labels(s),
    name = labels(s, { ...o, bbLabels: false });
  expect(initial[1] > span[1]).toBeTruthy();
  expect(initial[3 * 16 + 1] < name[1]).toBeTruthy();
  camera.scale *= 4;
  const deep = labels(s, o);
  expect(deep).toStrictEqual(initial);
  camera.flipped = true;
  const flipped = labels(s, o);
  expect(decoded(flipped)).toBe("3:6VPH_PWR");
  for (let i = 0; i < flipped.length; i += 16) {
    expect(flipped[i + 14]).toBe(-1);
    expect(flipped[i + 1]).toBe(deep[i + 1]);
  }
  camera.flipped = false;
  camera.scale /= 4;
  expect(labels(s, o)).toStrictEqual(initial);
});

test("coincident drills are picked in the same grouped order as they are submitted", () => {
  const s = board([via(1, 2, 5), via(2, 0, 7), via(3, 0, 2)]),
    o = display(),
    index = new BoardIndex(s);
  const batches = new PrimitiveBatchBuilder(s)
    .build()
    .filter((b) => b.category === "drill" && b.data.length);
  expect(batches.map((b) => b.viaLayers)).toStrictEqual([
    [2, 3, 4, 5],
    [0, 1, 2, 3, 4, 5, 6, 7],
    [0, 1, 2],
  ]);
  expect(index.pick([0, 0], 1000, o, "via")?.object.value.id).toBe(3);
  expect(
    index.pick([0, 0], 1000, { ...o, hidden: new Set([0, 1, 2]) }, "via")
      ?.object.value.id,
  ).toBe(2);
});
