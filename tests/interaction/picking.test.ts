import { test, expect } from "vitest";

import { BoardDisplay } from "../../src/lib/board/display";
import type {
  BoardScene,
  PadShape,
  Pin,
  Point,
  Segment,
  Zone,
} from "../../src/lib/board/model";
import { BoardSearchIndex } from "../../src/lib/board/search";
import { PadShape as PadShapeGeometry } from "../../src/lib/board/shapes/pad";
import { PolygonShape } from "../../src/lib/board/shapes/polygon";
import {
  BoardIndex,
  segmentDistance,
  selectionScene,
} from "../../src/lib/interaction/picking";

import { Camera } from "../../src/lib/interaction/camera";
import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";
import { buildDrawingBatches } from "../../src/lib/render/drawing-batch-builder";

const segment = (
  id: number,
  layer: number,
  a: Point,
  b: Point,
  net = 1,
): Segment => ({
  id,
  trackId: 10,
  layer,
  a,
  b,
  width: 1,
  net,
});
const board = (patch: Partial<BoardScene> = {}): BoardScene => ({
  layers: [
    { id: 0, name: "TOP", color: "#ff0000" },
    { id: 1, name: "IN1", color: "#0000ff" },
  ],
  nets: new Map([
    [1, "GND"],
    [2, "VCC"],
  ]),
  segments: [],
  vias: [],
  pins: [],
  zones: [],
  texts: [],
  drawingLayers: [],
  outline: [],
  bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  diagnostics: [],
  ...patch,
});
const zone = (): Zone => {
  const rings: Point[][] = [
    [
      [-8, -8],
      [8, -8],
      [8, 8],
      [-8, 8],
    ],
    [
      [-2, -2],
      [-2, 2],
      [2, 2],
      [2, -2],
    ],
  ];
  return {
    id: 30,
    layer: 0,
    net: 1,
    rings,
    paths: rings.map((ring) =>
      ring.map((p, i) => ({
        ...segment(i, 0, p, ring[(i + 1) % ring.length]),
        width: 0,
      })),
    ),
    ...new PolygonShape(rings).triangulate(),
  };
};

test("overlap picking follows active layer, manual priorities and category visibility", () => {
  const scene = board({
    segments: [
      segment(1, 0, [-5, 0], [5, 0]),
      segment(2, 1, [0, -5], [0, 5], 2),
    ],
  });
  const index = new BoardIndex(scene),
    display = BoardDisplay.createDisplayOptions();
  expect(index.pick([0, 0], 100, display)?.object.value.id).toBe(1);
  display.priorities = [{ category: "etch", layer: 1 }];
  expect(index.pick([0, 0], 100, display)?.object.value.id).toBe(2);
  display.activeLayer = 0;
  expect(index.pick([0, 0], 100, display)?.object.value.id).toBe(1);
  display.hidden.add(0);
  expect(index.pick([0, 0], 100, display)?.object.value.id).toBe(2);
  expect(
    index.pick(
      [0, 0],
      100,
      BoardDisplay.setLayerVisibility(display, 1, "etch", false),
    ),
  ).toBe(null);
  expect(index.pick([0, 0], 100, { ...display, opacity: 0 })).toBe(null);
  expect(index.pick([0, 0], 100, display, "via")).toBe(null);
});

test.each([false, true])(
  "overlap picking and locating follow line/arc submission order (reversed: %s)",
  (reversed) => {
    const arc: Segment = {
      ...segment(1, 0, [1, 0], [0, 1], 1),
      width: 0.1,
      arc: { center: [0, 0], radius: 1, start: 0, sweep: Math.PI / 2 },
    };
    const line = { ...segment(2, 0, [1, -1], [1, 1], 2), width: 0.1 };
    const scene = board({ segments: reversed ? [line, arc] : [arc, line] });
    const batches = new PrimitiveBatchBuilder(scene, "net")
      .build()
      .filter((batch) => batch.category === "etch" && batch.data.length > 0);
    expect(batches.map((batch) => !!batch.arcs)).toEqual([false, true]);
    const index = new BoardIndex(scene),
      display = BoardDisplay.createDisplayOptions();
    expect(index.pick([1, 0], 100, display)?.object.value.id).toBe(arc.id);
    line.net = 1;
    const sameNetIndex = new BoardIndex(scene);
    expect(
      sameNetIndex.find({ kind: "net", id: 1, name: "GND", count: 2 }, display)
        ?.anchor.object.value.id,
    ).toBe(arc.id);
  },
);

test("drawing picking follows line/arc passes within each bounded batch", () => {
  const layer = 0x10000;
  const arc: Segment = {
    ...segment(1, layer, [1, 0], [0, 1], 0),
    width: 0.1,
    arc: { center: [0, 0], radius: 1, start: 0, sweep: Math.PI / 2 },
  };
  const line = { ...segment(2, layer, [1, -1], [1, 1], 0), width: 0.1 };
  const drawing = (id: number, segments: Segment[]) => ({
    id,
    layer,
    net: 0 as const,
    graphicIds: [],
    texts: [],
    segments,
  });
  const scene = board({
    drawingLayers: [
      { id: layer, name: "Graphics", color: "#ffffff", defaultVisible: true },
    ],
    drawings: [drawing(10, [arc]), drawing(20, [line])],
  });
  const display = BoardDisplay.createDisplayOptions(scene.drawingLayers);
  expect(
    new BoardIndex(scene).pick([1, 0], 100, display)?.object.value.id,
  ).toBe(10);
  scene.drawings![0].segments = [
    arc,
    ...Array.from({ length: BoardDisplay.drawingBatchSize - 1 }, (_, i) =>
      segment(i + 3, layer, [10, 10], [11, 11], 0),
    ),
  ];
  const batches = [...buildDrawingBatches(scene)].filter((batch) => !!batch);
  expect(batches.map((batch) => !!batch?.arcs)).toEqual([false, true, false]);
  expect(
    new BoardIndex(scene).pick([1, 0], 100, display)?.object.value.id,
  ).toBe(20);
});

test("copper holes are excluded; transparent copper is picked only along its boundary", () => {
  const index = new BoardIndex(board({ zones: [zone()] })),
    display = BoardDisplay.createDisplayOptions();
  expect(index.pick([0, 0], 100, display)).toBe(null);
  expect(index.pick([4, 0], 100, display)?.object.kind).toBe("zone");
  display.shapes = 0;
  expect(index.pick([4, 0], 100, display)).toBe(null);
  expect(index.pick([8, 0], 100, display)?.category).toBe("zone-outline");
  expect(index.pick([2, 0], 100, display)?.category).toBe("zone-outline");
  expect(index.pick([0, 0], 100, display)).toBe(null);
});

test("arc picking uses directed sweep and round ends rather than its bounding box", () => {
  const arc: Segment = {
    ...segment(1, 0, [3, 0], [0, 3]),
    arc: { center: [0, 0], radius: 3, start: 0, sweep: Math.PI / 2 },
  };
  const index = new BoardIndex(board({ segments: [arc] })),
    display = BoardDisplay.createDisplayOptions();
  expect(index.pick([0, 0], 100, display)).toBe(null);
  expect(index.pick([-3, 0], 100, display)).toBe(null);
  expect(index.pick([3.4, 0], 100, display)).toBeTruthy();
  expect(
    index.pick([Math.SQRT1_2 * 3, Math.SQRT1_2 * 3], 100, display),
  ).toBeTruthy();
  const reverse = { ...arc, arc: { ...arc.arc!, sweep: -Math.PI * 1.5 } };
  expect(segmentDistance([-3, 0], reverse)).toBe(0);
});

test("via outline, fill and drill picking respect the visible pad layer", () => {
  const index = new BoardIndex(
    board({
      vias: [
        {
          id: 9,
          net: 1,
          at: [0, 0],
          padstack: 0,
          drill: 0.5,
          startLayer: 0,
          endLayer: 1,
          pads: [{ layer: 0, type: 2, width: 2, height: 2, offset: [0, 0] }],
        },
      ],
    }),
  );
  let display = BoardDisplay.createDisplayOptions();
  expect(display.filled).toBe(true);
  expect(index.pick([0, 0], 100, display)?.category).toBe("drill");
  display.drills = false;
  expect(index.pick([0, 0], 100, display)?.category).toBe("via");
  display.filled = false;
  expect(index.pick([0, 0], 100, display)).toBe(null);
  expect(index.pick([1, 0], 100, display)?.category).toBe("via");
  display.filled = true;
  expect(index.pick([0.5, 0], 100, display)?.category).toBe("via");
  display = BoardDisplay.setLayerVisibility(display, 0, "via", false);
  expect(index.pick([0.5, 0], 100, display)).toBe(null);
  display.drills = true;
  expect(index.pick([0, 0], 100, display)).toBe(null);
  display = BoardDisplay.setLayerVisibility(display, 0, "via", true);
  expect(index.pick([0, 0], 100, display)?.category).toBe("drill");
});

test("pad hit tests match rotation, offset, rounded corners and mirrored custom cutouts", () => {
  const pad: PadShape = {
    layer: 0,
    type: 27,
    width: 4,
    height: 2,
    offset: [2, 0],
    corner: 0.5,
  };
  const pin: Pin = {
    id: 8,
    net: 1,
    reference: "U1",
    name: "A1",
    at: [10, 10],
    angle: Math.PI / 2,
    back: false,
    drill: 0,
    shapes: [pad],
  };
  const index = new BoardIndex(board({ pins: [pin] })),
    display = { ...BoardDisplay.createDisplayOptions(), filled: true };
  expect(index.pick([12, 11.5], 100, display)?.object.kind).toBe("pin");
  expect(index.pick([13, 12], 100, display)).toBe(null);
  expect(
    new PadShapeGeometry(pad).distance([12.99, 11.99], pin) > 0,
  ).toBeTruthy();
  const custom: PadShape = {
    ...pad,
    type: 22,
    offset: [0, 0],
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
  };
  const backPin = {
    ...pin,
    at: [0, 0] as Point,
    angle: 0,
    back: true,
    shapes: [custom],
  };
  expect(
    new PadShapeGeometry(custom).distance([3, -3], backPin) < 0,
  ).toBeTruthy();
  expect(
    new PadShapeGeometry(custom).distance([1.5, -1.5], backPin) > 0,
  ).toBeTruthy();
  expect(
    new PadShapeGeometry(custom).distance([3, 3], backPin) > 0,
  ).toBeTruthy();
});

test("selection expands a track or net without losing source objects or altering the board", () => {
  const scene = board({
    segments: [
      segment(1, 0, [-6, 0], [0, 0]),
      segment(2, 0, [0, 0], [6, 0]),
      { ...segment(3, 1, [-5, 5], [5, 5]), trackId: 20 },
    ],
    zones: [zone()],
  });
  const index = new BoardIndex(scene),
    display = BoardDisplay.createDisplayOptions(),
    hit = index.pick([4, 0], 100, display, "segment")!;
  const track = index.select(hit, "track"),
    net = index.select(hit, "net");
  expect(track.objects.map((o) => o.value.id)).toStrictEqual([1, 2]);
  expect(net.objects.map((o) => o.value.id)).toStrictEqual([1, 2, 3, 30]);
  const subset = selectionScene(scene, track.objects);
  expect(subset.bounds).toBe(scene.bounds);
  expect(subset.segments[0]).toBe(scene.segments[0]);
  expect(subset.zones.length).toBe(0);
  expect(scene.zones.length).toBe(1);
});

test("spatial index rejects distant candidates and click tolerance stays in screen pixels", () => {
  const scene = board({
    segments: Array.from({ length: 10000 }, (_, i) =>
      segment(i, 0, [i * 5, 0], [i * 5 + 2, 0]),
    ),
  });
  const index = new BoardIndex(scene),
    display = BoardDisplay.createDisplayOptions();
  expect(index.pick([1, 0.54], 100, display)).toBeTruthy();
  expect(index.pick([1, 0.56], 100, display)).toBe(null);
  expect(index.lastCandidateCount < 10).toBeTruthy();
  expect(index.pick([1, 0.56], 10, display)).toBeTruthy();
  const camera = new Camera();
  camera.fit({ minX: 100, minY: 200, maxX: 120, maxY: 220 }, 800, 600);
  expect(
    camera.worldPoint(400, 300, 800, 600, {
      minX: 100,
      minY: 200,
      maxX: 120,
      maxY: 220,
    }),
  ).toStrictEqual([110, 210]);
  const before = camera.worldPoint(510, 420, 800, 600, scene.bounds);
  camera.zoom(8, 510, 420, 800, 600);
  const after = camera.worldPoint(510, 420, 800, 600, scene.bounds);
  expect(
    Math.hypot(before[0] - after[0], before[1] - after[1]) < 1e-12,
  ).toBeTruthy();
});

test("search ranks exact names, preserves duplicate-name network IDs and locates component members", () => {
  const pad: PadShape = {
    layer: 0,
    type: 2,
    width: 1,
    height: 1,
    offset: [0, 0],
    corner: 0,
  };
  const pin: Pin = {
    id: 20,
    net: 1,
    reference: "U1",
    name: "1",
    at: [10, 10],
    angle: 0,
    back: false,
    drill: 0,
    shapes: [pad],
  };
  const scene = board({
    nets: new Map([
      [1, "DATA"],
      [2, "DATA"],
      [3, "DATA_CLK"],
    ]),
    segments: [
      segment(1, 0, [0, 0], [3, 0], 1),
      segment(2, 1, [0, 1], [3, 1], 2),
      segment(3, 1, [0, 2], [3, 2], 3),
    ],
    pins: [
      pin,
      { ...pin, id: 21, name: "2", at: [12, 10] },
      { ...pin, id: 22, reference: "U10", at: [20, 20] },
    ],
  });
  const items = BoardSearchIndex.buildItems(scene),
    results = new BoardSearchIndex(items).find(" data ");
  expect(results.map((item) => item.id)).toStrictEqual([1, 2, 3]);
  expect(new BoardSearchIndex(items).find("u1")[0].name).toBe("U1");
  expect(new BoardSearchIndex(items).find("   ")).toStrictEqual([]);
  const index = new BoardIndex(scene),
    display = BoardDisplay.createDisplayOptions(),
    component = new BoardSearchIndex(items).find("U1")[0];
  const selection = index.find(component, display)!;
  expect(selection.mode).toBe("component");
  expect(selection.objects.map((object) => object.value.id)).toStrictEqual([
    20, 21,
  ]);
  expect(index.boundsFor(selection.objects)).toStrictEqual({
    minX: 9.5,
    minY: 9.5,
    maxX: 12.5,
    maxY: 10.5,
  });
  display.hidden.add(0);
  expect(index.find(component, display)?.objects.length).toBe(2);
  expect(display.hidden).toStrictEqual(new Set([0]));
  expect(
    index.find({ kind: "net", id: 999, name: "missing", count: 0 }, display),
  ).toBe(null);
});
