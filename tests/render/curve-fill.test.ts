import { test, expect } from "vitest";

import { CopperMesh } from "../../src/lib/board/copper-mesh";
import type { Point, Segment } from "../../src/lib/board/model";
import { ArcShape } from "../../src/lib/board/shapes/arc";
import { PathShape } from "../../src/lib/board/shapes/path";
import { PolygonShape } from "../../src/lib/board/shapes/polygon";
import { ZoneShape } from "../../src/lib/board/shapes/zone";

import { CurveTessellator } from "../../src/lib/render/curve-tessellator";

function circle(center: Point, radius: number, clockwise = false): Segment[] {
  const arc = {
    center,
    radius,
    start: 0.19,
    sweep: 2 * Math.PI * (clockwise ? -1 : 1),
  };
  return [
    {
      id: 1,
      trackId: 1,
      layer: 0,
      net: 0,
      width: 0,
      a: new ArcShape(arc).point(arc.start),
      b: new ArcShape(arc).point(arc.start + arc.sweep),
      arc,
    },
  ];
}

test("analytic curve containment follows actual circle rims at microscope scale in either winding", () => {
  for (const clockwise of [false, true])
    for (const radius of [0.125, 2175.698341856357]) {
      const center: Point = [131.123456789, -82.789123456],
        path = circle(center, radius, clockwise);
      for (let i = 0; i < 64; i++) {
        const angle = (i * Math.PI) / 32;
        for (const offset of [-1e-7, 1e-7]) {
          const p: Point = [
            center[0] + (radius + offset) * Math.cos(angle),
            center[1] + (radius + offset) * Math.sin(angle),
          ];
          expect(
            new PathShape(path).contains(p),
            `${clockwise}/${radius}/${angle}/${offset}`,
          ).toBe(offset < 0);
        }
      }
      const b = new PathShape(path).bounds();
      expect(b.minX).toBe(center[0] - radius);
      expect(b.maxY).toBe(center[1] + radius);
    }
});

test("local tessellation bounds screen error without subdividing the whole large circle", () => {
  const path = circle(
    [-958.8637160024715, -1716.2719675042774],
    2175.698341856357,
  );
  for (const scale of [1e4, 1e6, 1e7])
    for (const angle of [0, 1.047, Math.PI / 2, 3.3]) {
      const focus = new ArcShape(path[0].arc!).point(angle),
        radius = path[0].arc!.radius;
      const view = {
        minX: focus[0] - 800 / scale,
        maxX: focus[0] + 800 / scale,
        minY: focus[1] - 600 / scale,
        maxY: focus[1] + 600 / scale,
      };
      const ring = CurveTessellator.ring(path, view, 0.2 / scale);
      expect(
        ring.length < 150,
        `unexpected whole-circle tessellation: ${ring.length}`,
      ).toBeTruthy();
      for (const p of ring)
        expect(
          p[0] >= view.minX &&
            p[0] <= view.maxX &&
            p[1] >= view.minY &&
            p[1] <= view.maxY,
        ).toBeTruthy();
      for (let y = -550; y <= 550; y += 23)
        for (let x = -750; x <= 750; x += 23) {
          const p: Point = [focus[0] + x / scale, focus[1] + y / scale];
          const d =
            Math.hypot(
              p[0] - path[0].arc!.center[0],
              p[1] - path[0].arc!.center[1],
            ) - radius;
          if (Math.abs(d) > 0.3 / scale)
            expect(
              PolygonShape.containsRing(p, ring),
              `${scale}/${angle}/${x}/${y}`,
            ).toBe(d < 0);
        }
    }
});

test("viewport clipping retains disconnected parts of a concave contour", () => {
  const points: Point[] = [
    [-3, -3],
    [3, -3],
    [3, 3],
    [1, 3],
    [1, -1],
    [-1, -1],
    [-1, 3],
    [-3, 3],
  ];
  const path: Segment[] = points.map((a, i) => ({
    id: i,
    trackId: i,
    layer: 0,
    net: 0,
    width: 0,
    a,
    b: points[(i + 1) % points.length],
  }));
  const clipped = CurveTessellator.ring(
    path,
    { minX: -2, maxX: 2, minY: 0, maxY: 2 },
    0.01,
  );
  for (let x = -1.95; x < 2; x += 0.1)
    for (let y = 0.05; y < 2; y += 0.1)
      expect(PolygonShape.containsRing([x, y], clipped)).toBe(
        PolygonShape.containsRing([x, y], points),
      );
});

test("minor and major curved caps honor their directed sweeps and stored endpoint connectors", () => {
  for (const major of [false, true])
    for (const clockwise of [false, true]) {
      const arc = {
        center: [0, 0] as Point,
        radius: 2,
        start: major ? 0.6 : -0.6,
        sweep: major ? Math.PI * 2 - 1.2 : 1.2,
      };
      if (clockwise) {
        arc.start += arc.sweep;
        arc.sweep *= -1;
      }
      const a = new ArcShape(arc).point(arc.start),
        b = new ArcShape(arc).point(arc.start + arc.sweep);
      const path: Segment[] = [
        { id: 1, trackId: 1, layer: 0, net: 0, width: 0, a, b, arc },
      ];
      for (let x = -2.1; x <= 2.1; x += 0.031)
        for (let y = -2.1; y <= 2.1; y += 0.047) {
          const expected =
            x * x + y * y < 4 &&
            (major ? x < 2 * Math.cos(0.6) : x > 2 * Math.cos(0.6));
          expect(new PathShape(path).contains([x, y])).toBe(expected);
        }
    }
  const arc = {
    center: [0, 0] as Point,
    radius: 1,
    start: 0,
    sweep: Math.PI / 2,
  };
  const path: Segment[] = [
    {
      id: 1,
      trackId: 1,
      layer: 0,
      net: 0,
      width: 0,
      a: [1.1, 0],
      b: [0, 1.1],
      arc,
    },
  ];
  // Stored endpoints create tiny triangular strips between arc and closing chord.
  expect(new PathShape(path).contains([1.04, 0.01])).toBe(true);
  expect(new PathShape(path).contains([1.04, -0.01])).toBe(false);
  expect(new PathShape(path).contains([0.5, 0.5])).toBe(false);
});

test("spatial candidates preserve curved outer-minus-union holes at unsampled extrema", async () => {
  const paths = [
    circle([0, 0], 10),
    circle([0, 0], 3),
    circle([2, 0], 3, true),
    circle([0, 0], 1),
  ];
  for (let i = 0; i < 200; i++) paths.push(circle([100 + i, 100], 0.1));
  const mesh = await new CopperMesh(
    paths.map((p) => new PathShape(p).flatten()),
  ).build(undefined, paths);
  const zone = { id: 1, layer: 0, net: 0, paths, rings: [], ...mesh };
  for (const p of [
    [0, 0],
    [2, 0],
    [4, 0],
    [2, 2],
  ] as Point[])
    expect(new ZoneShape(zone).contains(p)).toBe(false);
  expect(new ZoneShape(zone).contains([8, 0])).toBe(true);
  expect(new ZoneShape(zone).contains([0, 3 - 1e-8])).toBe(false);
  expect(new ZoneShape(zone).contains([0, 3 + 1e-8])).toBe(true);
  const candidates = [
    ...new ZoneShape(zone).holeCandidates({
      minX: 0,
      maxX: 0,
      minY: 3 - 1e-8,
      maxY: 3 - 1e-8,
    }),
  ];
  expect(candidates.includes(1)).toBeTruthy();
  expect(candidates.length < 4).toBeTruthy();
});
