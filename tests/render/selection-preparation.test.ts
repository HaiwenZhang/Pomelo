import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene, PadShape, Via } from "../../src/lib/board/model";
import {
  BoardIndex,
  selectionSceneSteps,
} from "../../src/lib/interaction/picking";

import { ArcBatchBuilder } from "../../src/lib/render/arc-batch-builder";
import { SelectionLayerCollector } from "../../src/lib/render/selection-layer-collector";
import { SelectionPacketBuilder } from "../../src/lib/render/selection-packet-builder";

test("large network lookup yields, retains hidden members and honors draw priority without sorting entries", () => {
  const scene: BoardScene = {
    layers: [
      { id: 0, name: "TOP", color: "#fff" },
      { id: 1, name: "BOTTOM", color: "#fff" },
    ],
    nets: new Map([[1, "GND"]]),
    segments: Array.from({ length: 5000 }, (_, i) => ({
      id: i + 1,
      trackId: i + 1,
      layer: i % 2,
      net: 1,
      a: [i, 0],
      b: [i, 1],
      width: 1,
    })),
    vias: [],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: 0, minY: 0, maxX: 5000, maxY: 1 },
  };
  const index = new BoardIndex(scene),
    item = { kind: "net" as const, id: 1, name: "GND", count: 5000 };
  for (const [display, id] of [
    [BoardDisplay.createDisplayOptions(), 4999],
    [{ ...BoardDisplay.createDisplayOptions(), activeLayer: 1 }, 5000],
    [{ ...BoardDisplay.createDisplayOptions(), hidden: new Set([0]) }, 5000],
    [{ ...BoardDisplay.createDisplayOptions(), hidden: new Set([0, 1]) }, 4999],
  ] as const) {
    const steps = index.locateSteps(item, display);
    let step = steps.next(),
      yields = 0;
    while (!step.done) {
      yields++;
      step = steps.next();
    }
    expect(yields >= 2).toBeTruthy();
    expect(step.value.selection!.objects.length).toBe(5000);
    expect(step.value.selection!.anchor.object.value.id).toBe(id);
    expect(step.value.bounds).toStrictEqual({
      minX: -0.5,
      minY: -0.5,
      maxX: 4999.5,
      maxY: 1.5,
    });
  }
  const lookup = index.locateSteps(item, BoardDisplay.createDisplayOptions());
  expect(lookup.next().done).toBe(false);
  lookup.return({ selection: null, bounds: null });
  expect(lookup.next().done).toBe(true);
  const split = selectionSceneSteps(scene, index.objects);
  expect(split.next().done).toBe(false);
  split.return(scene);
  expect(
    index.find(item, BoardDisplay.createDisplayOptions())!.objects.length,
  ).toBe(5000);
});

test("bounded selection packets preserve exact line/arc data, residuals and submission order", () => {
  const values: number[] = [];
  for (let i = 0; i < 11000; i++)
    values.push(
      i + 0.123456789,
      i / 3 + 0.987654321,
      2,
      0.4,
      0.12,
      1.2,
      i % 3 ? 0 : 1,
      0,
      0.2,
      0.4,
      0.8,
      1,
    );
  const meta = { layer: 2, category: "etch" as const },
    expected = ArcBatchBuilder.build(meta, values);
  const steps = [...SelectionPacketBuilder.buildSteps(meta, values, 12, true)],
    actual = steps.filter((s) => !!s);
  expect(steps.filter((s) => !s).length >= 3).toBeTruthy();
  let seenArc = false;
  for (const packet of actual) {
    if (packet.arcs) seenArc = true;
    else expect(seenArc).toBe(false);
  }
  for (const source of expected)
    for (const field of ["data", "residual"] as const) {
      const joined = actual
        .filter((p) => !!p.arcs === !!source.arcs)
        .flatMap((p) => [...p[field]]);
      expect(new Float32Array(joined)).toStrictEqual(source[field]);
    }
});

test("selection layer lists preserve repeated owners and multiple pads on the same layer", () => {
  const pad = (layer: number): PadShape => ({
    layer,
    type: 2,
    width: 1,
    height: 1,
    offset: [0, 0],
  });
  const a: Via = {
    id: 1,
    net: 1,
    at: [0, 0],
    padstack: 1,
    drill: 0.2,
    startLayer: 0,
    endLayer: 1,
    pads: [pad(0), pad(1), pad(0)],
  };
  const b: Via = { ...a, id: 2, pads: [pad(1)] };
  const scene: BoardScene = {
    layers: [],
    nets: new Map(),
    segments: [],
    vias: [b, a, a, b],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  };
  const steps = SelectionLayerCollector.collectSteps(scene);
  let result = steps.next();
  while (!result.done) result = steps.next();
  expect(result.value.vias.get(0)).toStrictEqual([a, a]);
  expect(result.value.vias.get(1)).toStrictEqual([b, a, a, b]);
  expect(result.value.vias.get(0)![0].pads).toBe(a.pads);
  expect(scene.vias).toStrictEqual([b, a, a, b]);
  expect(result.value.vias.get(2)).toBe(undefined);
});

test("selection layer preparation yields inside large owner and pad collections", () => {
  let reads = 0;
  const via = {
    id: 1,
    net: 1,
    at: [0, 0],
    padstack: 1,
    drill: 0,
    startLayer: 0,
    endLayer: 0,
    get pads() {
      reads++;
      return [];
    },
  } as Via;
  const scene: BoardScene = {
    layers: [],
    nets: new Map(),
    segments: [],
    zones: [],
    pins: [],
    vias: new Array(100000).fill(via),
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
  };
  const steps = SelectionLayerCollector.collectSteps(scene);
  expect(steps.next().done).toBe(false);
  expect(reads > 0 && reads < 100000).toBeTruthy();
  steps.return({
    segments: new Map(),
    zones: new Map(),
    pins: new Map(),
    vias: new Map(),
  });
  expect(steps.next().done).toBe(true);
});
