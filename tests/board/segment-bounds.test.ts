import { test, expect } from "vitest";

import type { Point, Segment } from "../../src/lib/board/model";
import { SegmentShape } from "../../src/lib/board/shapes/segment";

function arc(
  start: number,
  sweep: number,
  radius = 10,
  center: Point = [0, 0],
): Segment {
  const at = (a: number): Point => [
    center[0] + radius * Math.cos(a),
    center[1] + radius * Math.sin(a),
  ];
  return {
    id: 1,
    trackId: 1,
    layer: 0,
    net: 1,
    width: 0.4,
    a: at(start),
    b: at(start + sweep),
    arc: { center, radius, start, sweep },
  };
}
test("large-radius short arcs bound the actual sweep instead of the supporting circle", () => {
  const s = arc(Math.PI / 2 - 0.002, 0.004, 10000, [30, -10000]),
    b = new SegmentShape(s).bounds();
  expect(b.maxX - b.minX < 41).toBeTruthy();
  expect(b.maxY - b.minY < 0.5).toBeTruthy();
  expect(b.maxY >= 0.2).toBeTruthy();
  expect(b.minX <= s.a[0] - 0.2 && b.maxX >= s.b[0] + 0.2).toBeTruthy();
});
test("arc bounds include cardinal extrema across direction, seams, major arcs and complete circles", () => {
  for (const start of [-3, -1, 0, 1, 3, 7])
    for (const sweep of [-Math.PI * 2, -5, -0.3, 0.3, 5, Math.PI * 2]) {
      const s = arc(start, sweep),
        b = new SegmentShape(s).bounds();
      for (let i = 0; i <= 1000; i++) {
        const a = start + (sweep * i) / 1000,
          x = 10 * Math.cos(a),
          y = 10 * Math.sin(a);
        expect(
          x >= b.minX + 0.2 - 1e-10 &&
            x <= b.maxX - 0.2 + 1e-10 &&
            y >= b.minY + 0.2 - 1e-10 &&
            y <= b.maxY - 0.2 + 1e-10,
        ).toBeTruthy();
      }
      if (Math.abs(sweep) === Math.PI * 2)
        expect(b).toStrictEqual({
          minX: -10.2,
          minY: -10.2,
          maxX: 10.2,
          maxY: 10.2,
        });
    }
});
test("line bounds retain round caps and reversed endpoint ordering", () => {
  const s: Segment = {
    id: 1,
    trackId: 1,
    layer: 0,
    net: 0,
    width: 2,
    a: [5, 2],
    b: [-3, -4],
  };
  expect(new SegmentShape(s).bounds()).toStrictEqual({
    minX: -4,
    minY: -5,
    maxX: 6,
    maxY: 3,
  });
});

test("scratch bounds are replaced in full while ordinary results remain independently owned", () => {
  const s = arc(0, Math.PI / 2),
    saved = new SegmentShape(s).bounds(),
    snapshot = { ...saved };
  const scratch = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  expect(new SegmentShape(s).bounds(scratch)).toBe(scratch);
  expect(scratch).toStrictEqual(saved);
  // The next call must overwrite every field, including when width is negative.
  const line: Segment = {
    id: 2,
    trackId: 2,
    layer: 0,
    net: 0,
    width: -1,
    a: [-200, -300],
    b: [-100, -150],
  };
  new SegmentShape(line).bounds(scratch);
  expect(scratch).toStrictEqual({
    minX: -200,
    minY: -300,
    maxX: -100,
    maxY: -150,
  });
  expect(saved).toStrictEqual(snapshot);
  expect(new SegmentShape(s).bounds()).not.toBe(saved);
  const rounded = arc(0, Math.PI / 2);
  rounded.a = [10.01, -0.01];
  // Stored rounded endpoints still contribute outside the ideal arc.
  expect(new SegmentShape(rounded).bounds(scratch)).toStrictEqual({
    minX: Math.cos(Math.PI / 2) * 10 - 0.2,
    minY: -0.01 - 0.2,
    maxX: 10.01 + 0.2,
    maxY: 10 + 0.2,
  });
});
