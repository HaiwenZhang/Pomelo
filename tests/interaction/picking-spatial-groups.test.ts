import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type { BoardScene, PadShape, Point } from "../../src/lib/board/model";
import { PadShape as PadShapeGeometry } from "../../src/lib/board/shapes/pad";
import { BoardIndex } from "../../src/lib/interaction/picking";

function board(): BoardScene {
  const pads: PadShape[] = Array.from({ length: 6 }, (_, layer) => ({
    layer,
    type: 2,
    width: 0.8 + layer * 0.2,
    height: 0.8 + layer * 0.2,
    offset: [layer % 2 ? 2 : 0, 0],
  }));
  return {
    layers: pads.map((p) => ({
      id: p.layer,
      name: `L${p.layer}`,
      color: "#ffffff",
    })),
    nets: new Map([[1, "GND"]]),
    segments: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: -10, minY: -10, maxX: 200, maxY: 200 },
    vias: Array.from({ length: 200 }, (_, id) => ({
      id,
      net: 1,
      at: [(id % 20) * 6, Math.floor(id / 20) * 6],
      padstack: 1,
      drill: 0.4,
      startLayer: 0,
      endLayer: 5,
      pads,
    })),
    pins: Array.from({ length: 40 }, (_, id) => ({
      id: 1000 + id,
      net: 1,
      at: [(id % 20) * 6, Math.floor(id / 20) * 6],
      reference: "U1",
      name: String(id),
      angle: ((id % 4) * Math.PI) / 2,
      back: !!(id % 2),
      drill: 0.3,
      shapes: [
        { layer: 0, type: 6, width: 1, height: 3, offset: [-1, 1] },
        {
          layer: 4,
          type: 22,
          width: 4,
          height: 4,
          offset: [1, 0],
          custom: [
            [
              [0, 0],
              [4, 0],
              [4, 4],
              [0, 4],
            ],
            [
              [1, 1],
              [1, 2],
              [2, 2],
              [2, 1],
            ],
          ],
        },
      ],
    })),
  };
}

test("grouped spatial candidates equal a full entry scan for layered, offset and rotated pads", () => {
  const scene = board(),
    index = new BoardIndex(scene);
  const internals = index as unknown as {
    root: unknown;
    entriesByObject: Map<unknown, Array<{ bounds: unknown }>>;
  };
  const root = internals.root,
    flat = {
      bounds: scene.bounds,
      entries: [...internals.entriesByObject.values()].flat(),
    };
  const normal = BoardDisplay.createDisplayOptions(),
    visible = { ...normal, filled: true };
  const modes = [
    normal,
    visible,
    { ...visible, drills: false },
    BoardDisplay.setLayerVisibility(visible, 0, "via", false),
    { ...visible, hidden: new Set([1, 3, 4, 5]), activeLayer: 2 },
    { ...normal, priorities: [{ category: "pin" as const, layer: 4 }] },
  ];
  const points: Point[] = [];
  for (const via of scene.vias)
    for (const delta of [
      [0, 0],
      [1, 0],
      [2.2, 0],
      [-1, 2],
      [3, 3],
    ])
      points.push([via.at[0] + delta[0], via.at[1] + delta[1]]);
  for (const display of modes)
    for (const [i, point] of points.entries()) {
      const scale = [10, 100, 10000][i % 3];
      internals.root = root;
      const actual = index.pick(point, scale, display),
        count = index.lastCandidateCount;
      internals.root = flat;
      const expected = index.pick(point, scale, display);
      expect(actual, `${i}, scale ${scale}`).toStrictEqual(expected);
      expect(count).toBe(index.lastCandidateCount);
    }
  internals.root = root;
});

test("a hidden large pad does not make a smaller visible layer selectable across the group bounds", () => {
  const scene = board();
  scene.vias = scene.vias.slice(0, 1);
  scene.pins = [];
  const index = new BoardIndex(scene),
    display = {
      ...BoardDisplay.createDisplayOptions(),
      filled: true,
      drills: false,
      hidden: new Set([1, 2, 3, 4, 5]),
    };
  expect(index.pick([2, 0], 100, display)).toBe(null);
  expect(index.pick([0.2, 0], 100, display)?.object.value.id).toBe(0);
  expect(
    index.pick([2, 0], 100, { ...display, hidden: new Set([0, 2, 3, 4, 5]) })
      ?.layer,
  ).toBe(1);
});

test("identical layer bounds share storage while distinct double-precision edges remain independent", () => {
  const scene = board();
  scene.pins = [];
  scene.vias = scene.vias.slice(0, 1);
  const owner = scene.vias[0];
  owner.at = [1e6, 1e6];
  owner.pads = [0, 1, 2].map((layer) => ({
    layer,
    type: 2,
    width: 2,
    height: 2,
    offset: [0, 0],
  }));
  owner.pads.push({
    layer: 3,
    type: 2,
    width: 2.00001,
    height: 2.00001,
    offset: [0, 0],
  });
  const index = new BoardIndex(scene),
    entries = [...(index as any).entriesByObject.values()][0] as any[];
  const pads = entries.filter((e) => e.category === "via");
  expect(pads[0].bounds).toBe(pads[1].bounds);
  expect(pads[1].bounds).toBe(pads[2].bounds);
  expect(pads[2].bounds).not.toBe(pads[3].bounds);
  for (const entry of entries)
    expect(entry.bounds).toStrictEqual(
      new PadShapeGeometry(entry.pad).bounds(owner),
    );
  const spatial = (index as any).root.entries[0];
  expect(spatial.bounds).toBe(pads[3].bounds);
});

test("a union of offset pad bounds never expands or mutates the original per-layer bounds", () => {
  const scene = board();
  scene.pins = [];
  scene.vias = scene.vias.slice(0, 1);
  const owner = scene.vias[0];
  owner.pads = [
    { layer: 0, type: 2, width: 2, height: 2, offset: [-2, 0] },
    { layer: 1, type: 2, width: 2, height: 2, offset: [2, 0] },
  ];
  const index = new BoardIndex(scene),
    entries = [...(index as any).entriesByObject.values()][0] as any[];
  for (const entry of entries)
    expect(entry.bounds).toStrictEqual(
      new PadShapeGeometry(entry.pad).bounds(owner),
    );
  const spatial = (index as any).root.entries[0];
  expect(spatial.bounds).toStrictEqual({
    minX: -3,
    minY: -1,
    maxX: 3,
    maxY: 1,
  });
  expect(entries.every((e) => e.bounds !== spatial.bounds)).toBeTruthy();
  const display = {
    ...BoardDisplay.createDisplayOptions(),
    filled: true,
    drills: false,
    hidden: new Set([0]),
  };
  expect(index.pick([-2, 0], 100, display)).toBe(null);
  expect(index.pick([2, 0], 100, display)?.layer).toBe(1);
});
