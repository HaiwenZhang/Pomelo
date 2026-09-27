import { test, expect } from "vitest";

import { PadShape } from "../../src/lib/board/shapes/pad";
import { padsPadGeometry } from "../../src/lib/pads/scene/pad-geometry";
import { placePadsPinShape } from "../../src/lib/pads/scene/pins";
import { padsPlacePoint } from "../../src/lib/pads/scene/placement";

import type { PadsPlacement } from "../../src/lib/pads/binary/metadata";
import type { PadsPadstack } from "../../src/lib/pads/binary/padstack";
const stack = {
  active: true,
  shapeCode: 1,
  width: 0.6,
  fingerLength: 1.4,
  fingerOffset: 0.2,
  angle: Math.PI / 2,
} as PadsPadstack;
const near = (a: number[], b: number[]) =>
  expect(
    Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-10,
    `${a} != ${b}`,
  ).toBeTruthy();
test("PADS Pin adapter keeps quarter-turn pads analytic with world-space copper offsets", () => {
  for (const bottom of [false, true]) {
    const part = { at: [4, 7], angle: 0.4, bottom } as PadsPlacement,
      g = padsPadGeometry(stack, 2)!;
    const shape = placePadsPinShape(g, part);
    expect(shape.custom).toBe(undefined);
    expect(shape.width).toBe(0.6);
    expect(shape.height).toBe(1.4);
    const owner = { at: part.at, angle: bottom ? -0.4 : 0.4, back: bottom };
    near(
      new PadShape(shape).toWorld([0, 0], owner),
      padsPlacePoint(
        [0.2 * Math.cos(stack.angle), 0.2 * Math.sin(stack.angle)],
        part,
      ),
    );
  }
});
test("PADS oblique custom contours agree with direct bottom-side placement", () => {
  for (const bottom of [false, true]) {
    const part = { at: [4, 7], angle: 0.4, bottom } as PadsPlacement,
      g = padsPadGeometry({ ...stack, angle: 0.31 }, 2)!;
    const shape = placePadsPinShape(g, part),
      owner = { at: part.at, angle: bottom ? -0.4 : 0.4, back: bottom };
    expect(shape.customPaths).toBeTruthy();
    expect(shape.custom).toBeTruthy();
    // The source rectangle is X-symmetric: sample the reflected source point
    // to match the adapter's orientation-preserving contour parameterization.
    const p = g.paths[0][0].a,
      q = shape.customPaths![0][0].a;
    const sign = bottom ? -1 : 1,
      x = sign * p[0] + g.localOffset[0],
      y = p[1];
    const local: [number, number] = [
      x * Math.cos(0.31) - y * Math.sin(0.31),
      x * Math.sin(0.31) + y * Math.cos(0.31),
    ];
    near(new PadShape(shape).toWorld(q, owner), padsPlacePoint(local, part));
  }
});

test("PADS slot owner rotation preserves independently oriented copper bounds", () => {
  for (const bottom of [false, true]) {
    const part = { at: [3, 5], angle: 0.37, bottom } as PadsPlacement,
      g = padsPadGeometry({ ...stack, angle: 0 }, 0)!;
    const angle = (bottom ? -1 : 1) * part.angle,
      slotAngle = angle + ((bottom ? -1 : 1) * Math.PI) / 2;
    const a = new PadShape(placePadsPinShape(g, part)).bounds({
      at: part.at,
      angle,
      back: bottom,
    });
    const b = new PadShape(placePadsPinShape(g, part, slotAngle)).bounds({
      at: part.at,
      angle: slotAngle,
      back: bottom,
    });
    near([a.minX, a.minY], [b.minX, b.minY]);
    near([a.maxX, a.maxY], [b.maxX, b.maxY]);
  }
});
