import { test, expect } from "vitest";

import {
  insetPadsCircularHole,
  isPadsCircularContour,
} from "../../src/lib/pads/copper/copper-boundary";
import type { PadsCopperContour } from "../../src/lib/pads/copper/copper";
const circle: PadsCopperContour = {
  piece: 1,
  width: 0.254,
  path: [
    {
      id: 1,
      trackId: 1,
      layer: 0,
      net: 1,
      width: 0,
      a: [3, 3],
      b: [1, 3],
      arc: { center: [2, 3], radius: 1, start: 0, sweep: Math.PI },
    },
    {
      id: 1,
      trackId: 1,
      layer: 0,
      net: 1,
      width: 0,
      a: [1, 3],
      b: [3, 3],
      arc: { center: [2, 3], radius: 1, start: Math.PI, sweep: Math.PI },
    },
  ],
};
test("PADS circular void insets by half stroke width and preserves analytic arcs", () => {
  const result = insetPadsCircularHole(circle)!;
  expect(result[0].arc!.radius).toBe(0.873);
  expect(result[0].arc!.center).toStrictEqual([2, 3]);
  expect(result[0].a).toStrictEqual([2.873, 3]);
  expect(result[1].arc!.sweep).toBe(Math.PI);
  expect(circle.path[0].arc!.radius).toBe(1);
  expect(insetPadsCircularHole({ ...circle, width: 2 })).toBe(null);
  expect(isPadsCircularContour(circle.path)).toBe(true);
});
test("PADS circular offset refuses open or noncircular contours and invalid widths", () => {
  expect(() =>
    insetPadsCircularHole({ ...circle, path: [circle.path[0]] }),
  ).toThrow(/非圆形/);
  expect(isPadsCircularContour([circle.path[0]])).toBe(false);
  const disconnected = { ...circle.path[1], a: [1, 3.01] as [number, number] };
  expect(() =>
    insetPadsCircularHole({ ...circle, path: [circle.path[0], disconnected] }),
  ).toThrow(/非圆形/);
  const badSweep = {
    ...circle.path[1],
    arc: {
      ...circle.path[1].arc!,
      sweep: Math.PI,
      center: [2.01, 3] as [number, number],
    },
  };
  expect(() =>
    insetPadsCircularHole({ ...circle, path: [circle.path[0], badSweep] }),
  ).toThrow(/非圆形/);
  expect(() => insetPadsCircularHole({ ...circle, width: -1 })).toThrow(
    /宽度无效/,
  );
});
