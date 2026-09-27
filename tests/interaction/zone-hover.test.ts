import { test, expect } from "vitest";

import { CopperMesh } from "../../src/lib/board/copper-mesh";
import type { BoardScene, Point, Segment } from "../../src/lib/board/model";
import { ArcShape } from "../../src/lib/board/shapes/arc";
import { PathShape } from "../../src/lib/board/shapes/path";
import { SegmentShape } from "../../src/lib/board/shapes/segment";
import { ZoneShape } from "../../src/lib/board/shapes/zone";
import { PolygonShape } from "../../src/lib/board/shapes/polygon";

import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";

function circle(center: Point, radius: number, clockwise = false): Segment[] {
  const arc = {
    center,
    radius,
    start: 0.13,
    sweep: Math.PI * 2 * (clockwise ? -1 : 1),
  };
  return [
    {
      id: 1,
      trackId: 0,
      layer: 0,
      net: 1,
      width: 0,
      a: new ArcShape(arc).point(arc.start),
      b: new ArcShape(arc).point(arc.start + arc.sweep),
      arc,
    },
  ];
}
test("spatial boundary picking agrees with full scans at curved extrema, holes and tolerance limits", async () => {
  const paths = [
    circle([0, 0], 10),
    circle([0, 0], 3),
    circle([2, 0], 3, true),
    circle([0, 0], 1),
  ];
  for (let i = 0; i < 256; i++) paths.push(circle([100 + i, 100], 0.1));
  const rings = paths.map((p) => new PathShape(p).flatten()),
    mesh = await new CopperMesh(rings).build(undefined, paths),
    zone = { id: 1, layer: 0, net: 1, paths, rings: [], ...mesh };
  for (const metadata of [true, false]) {
    const value = metadata
      ? zone
      : {
          ...zone,
          ringBounds: undefined,
          ringOrder: undefined,
          holeChunks: undefined,
        };
    for (let i = 0; i < 96; i++)
      for (const radius of [1e-7, 0.025, 0.2]) {
        const angle = (i * Math.PI) / 48;
        for (const offset of [
          -radius * 1.01,
          -radius * 0.99,
          radius * 0.99,
          radius * 1.01,
        ]) {
          const point: Point = [
            (3 + offset) * Math.cos(angle),
            (3 + offset) * Math.sin(angle),
          ];
          const full = Math.min(
            ...paths.flatMap((p) =>
              p.map((e) => new SegmentShape(e).distance(point)),
            ),
          );
          const actual = new ZoneShape(value).boundaryDistance(point, radius);
          if (full <= radius) expect(actual).toBe(full);
          else expect(actual > radius).toBeTruthy();
        }
      }
  }
});

test("zone outline ranges address exact standalone line and arc instances at nonzero offsets", async () => {
  const paths = [
    circle([-3, 0], 1),
    circle([3, 0], 2, true),
    circle([3, 0], 0.5),
  ];
  const rect: Point[] = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const straight: Segment[] = rect.map((a, i) => ({
    id: i,
    trackId: 0,
    net: 1,
    layer: 0,
    a,
    b: rect[(i + 1) % rect.length],
    width: 0,
  }));
  const zones = [];
  for (const [id, contours] of [
    [1, [straight, paths[0]]],
    [2, [paths[1], paths[2], straight]],
  ] as const) {
    const retained = [...contours];
    zones.push({
      id,
      layer: 0,
      net: 1,
      paths: retained,
      rings: [],
      ...(await new CopperMesh(
        retained.map((p) => new PathShape(p).flatten()),
      ).build(undefined, retained)),
    });
  }
  const scene: BoardScene = {
    layers: [{ id: 0, name: "TOP", color: "#407060" }],
    nets: new Map([[1, "GND"]]),
    segments: [],
    vias: [],
    pins: [],
    zones,
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  };
  const together = new PrimitiveBatchBuilder(scene)
    .build()
    .filter((b) => b.category === "zone-outline");
  let nonzero = 0;
  for (const zone of zones) {
    const alone = new PrimitiveBatchBuilder({ ...scene, zones: [zone] })
      .build()
      .filter((b) => b.category === "zone-outline");
    for (const batch of together) {
      const range = batch.outlines!.find((r) => r.id === zone.id);
      if (!range) continue;
      if (range.start) nonzero++;
      const reference = alone.find((b) => !!b.arcs === !!batch.arcs)!;
      for (const [field, stride] of [
        ["data", batch.arcs ? 20 : 12],
        ["residual", batch.arcs ? 12 : 4],
      ] as const)
        expect(
          batch[field].subarray(
            range.start * stride,
            (range.start + range.count) * stride,
          ),
        ).toStrictEqual(reference[field]);
    }
  }
  expect(nonzero).toBe(2);
});

test("should draw closed exterior and hole outlines when a zone retains only polygon coordinates", async () => {
  const rings: Point[][] = [
    [
      [1000000.001, 0],
      [1000010.001, 0],
      [1000010.001, 10],
      [1000000.001, 10],
    ],
    [
      [1000002.001, 2],
      [1000002.001, 4],
      [1000004.001, 4],
      [1000004.001, 2],
    ],
  ];
  const paths = rings.map((ring) =>
    ring.map((a, i): Segment => ({
      id: i,
      trackId: 1,
      layer: 0,
      net: 1,
      width: 0,
      a,
      b: ring[(i + 1) % ring.length],
    })),
  );
  const mesh = await new CopperMesh(rings).build();
  const zone = { id: 1, layer: 0, net: 1, paths, rings: [], ...mesh };
  const scene: BoardScene = {
    layers: [{ id: 0, name: "TOP", color: "#407060" }],
    nets: new Map(),
    segments: [],
    vias: [],
    pins: [],
    zones: [zone],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: 1000000, minY: 0, maxX: 1000010, maxY: 10 },
  };
  const outlines = (value: BoardScene) =>
    new PrimitiveBatchBuilder(value)
      .build()
      .filter((batch) => batch.category === "zone-outline");
  const expected = outlines(scene);
  expect(expected.reduce((sum, batch) => sum + batch.data.length / 12, 0)).toBe(
    8,
  );
  for (const polygon of [
    { ...zone, paths: [] }, // PADS, Altium and KiCad compact mesh representation.
    { ...zone, paths: [], rings, ringOffsets: undefined },
  ]) {
    expect(outlines({ ...scene, zones: [polygon] })).toStrictEqual(expected);
    const hover = [
      ...new PrimitiveBatchBuilder({ ...scene, zones: [polygon] }).buildSteps({
        kind: "selection",
        reuseOutlines: true,
      }),
    ].filter((batch) => batch?.category === "zone-outline");
    expect(hover[0]?.outlineRefs).toStrictEqual([zone.id]);
  }
});

test("should pick exterior and hole boundaries when only typed mesh rings are retained", async () => {
  const rings: Point[][] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ],
    [
      [2, 2],
      [2, 4],
      [4, 4],
      [4, 2],
    ],
  ];
  const mesh = await new CopperMesh(rings).build();
  const zone = { id: 1, layer: 0, net: 1, paths: [], rings: [], ...mesh };
  for (const candidate of [
    zone,
    {
      ...zone,
      ringBounds: undefined,
      ringOrder: undefined,
      holeChunks: undefined,
    },
  ]) {
    const shape = new ZoneShape(candidate);
    expect(
      Math.abs(shape.boundaryDistance([-0.05, 5], 0.1) - 0.05) < 1e-10,
    ).toBeTruthy();
    expect(
      Math.abs(shape.boundaryDistance([2.05, 3], 0.1) - 0.05) < 1e-10,
    ).toBeTruthy();
    expect(shape.boundaryDistance([5, 5], 0.1)).toBe(Infinity);
    expect(shape.boundaryDistance([-0.11, 5], 0.1)).toBe(Infinity);
  }
});

test("should omit doubled hole bridges when a filled polygon joins its contours with return edges", async () => {
  const rings: Point[][] = [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
      [2, 2],
      [2, 4],
      [4, 4],
      [4, 2],
      [2, 2],
    ],
  ];
  const boundaryBreaks = new PolygonShape(rings).bridgeEdges();
  expect([...boundaryBreaks]).toStrictEqual([4, 9]);
  const zone = {
    id: 1,
    layer: 0,
    net: 1,
    paths: [],
    rings: [],
    boundaryBreaks,
    ...(await new CopperMesh(rings).build()),
  };
  expect(new ZoneShape(zone).boundaryDistance([1, 1], 0.1)).toBe(Infinity);
  expect(new ZoneShape(zone).boundaryDistance([2, 3], 0.1)).toBe(0);
  const scene: BoardScene = {
    layers: [{ id: 0, name: "TOP", color: "#407060" }],
    nets: new Map(),
    segments: [],
    vias: [],
    pins: [],
    zones: [zone],
    outline: [],
    texts: [],
    drawingLayers: [],
    diagnostics: [],
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
  };
  const outlines = new PrimitiveBatchBuilder(scene)
    .build()
    .filter((batch) => batch.category === "zone-outline");
  expect(outlines.reduce((sum, batch) => sum + batch.data.length / 12, 0)).toBe(
    8,
  );
});
