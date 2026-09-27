import { test, expect } from "vitest";

import { padsPadGeometry } from "../../src/lib/pads/scene/pad-geometry";
import { padsPlacePoint } from "../../src/lib/pads/scene/placement";
import type { PadsPadstack } from "../../src/lib/pads/binary/padstack";
const stack = (shapeCode: number): PadsPadstack => ({
  index: 0,
  active: true,
  sourceOffset: 0,
  shapeCode,
  width: 1,
  drill: 0.4,
  fingerLength: 3,
  fingerOffset: 0,
  angle: Math.PI / 2,
  drillStart: 0,
  drillEnd: 0,
  slotLength: 0,
  slotAngle: 0,
  layers: [],
});
test("PADS finger geometry preserves local long axis and separate rotation", () => {
  const oval = padsPadGeometry(stack(0), 2)!;
  expect(oval.shape.width).toBe(3);
  expect(oval.shape.height).toBe(1);
  expect(oval.rotation).toBe(Math.PI / 2);
  expect(oval.paths[0].some((s) => s.arc)).toBeTruthy();
  const square = padsPadGeometry(stack(3), 2)!;
  expect(square.shape.width).toBe(1);
  expect(square.rotation).toBe(0);
});
test("PADS layer override uses its own second dimension and unknown shapes remain explicit", () => {
  const p = stack(1),
    override = {
      selector: 0,
      rawSelector: 0,
      shapeCode: 1,
      width: 0.8,
      second: 2,
      sourceOffset: 0,
      metadataOffset: 0,
      shapeOffset: 1,
    };
  expect(padsPadGeometry(p, 1, override)!.shape.width).toBe(2);
  expect(padsPadGeometry(p, 1, { ...override, width: 0 })).toBe(null);
  expect(() => padsPadGeometry(stack(10), 1)).toThrow(/尚待核验/);
});

test("PADS annulus retains its independent inner diameter instead of using the drill", () => {
  const p = { ...stack(4), width: 8.001, fingerLength: 5.08, drill: 4.064 };
  const g = padsPadGeometry(p, 0)!;
  expect(g.shape.type).toBe(25);
  expect(g.shape.innerDiameter).toBe(5.08);
  expect(g.rotation).toBe(0);
  expect(g.paths.length).toBe(2);
  expect(g.paths[0][0].arc!.radius).toBe(8.001 / 2);
  expect(g.paths[1][0].arc!.radius).toBe(5.08 / 2);
  const override = {
    selector: 255,
    rawSelector: 255,
    shapeCode: 4,
    width: 7,
    second: 4,
    sourceOffset: 0,
    metadataOffset: 0,
    shapeOffset: 1,
  };
  expect(padsPadGeometry(p, 1, override)!.shape.innerDiameter).toBe(4);
  expect(() => padsPadGeometry(p, 1, { ...override, second: 0 })).toThrow(
    /内径无效/,
  );
  expect(() => padsPadGeometry(p, 1, { ...override, second: 7 })).toThrow(
    /内径无效/,
  );
});

test("PADS finger center offset is signed, rotates and reflects without creating rounded corners", () => {
  const g = padsPadGeometry(
    { ...stack(1), width: 0.6096, fingerLength: 0.889, fingerOffset: -0.127 },
    0,
  )!;
  expect(g.shape.type).toBe(5);
  expect(g.shape.corner).toBe(undefined);
  expect(g.localOffset).toStrictEqual([-0.127, 0]);
  const top = padsPlacePoint(g.localOffset, {
    at: [0, 0],
    angle: g.rotation,
    bottom: false,
  });
  expect(Math.abs(top[0]) < 1e-12).toBeTruthy();
  expect(Math.abs(top[1] + 0.127) < 1e-12).toBeTruthy();
  const back = padsPlacePoint(g.localOffset, {
    at: [0, 0],
    angle: g.rotation + Math.PI / 2,
    bottom: true,
  });
  expect(Math.abs(back[0] + 0.127) < 1e-12).toBeTruthy();
  expect(Math.abs(back[1]) < 1e-12).toBeTruthy();
  expect(
    padsPadGeometry({ ...stack(0), fingerOffset: 0.254 }, 0)!.localOffset[0],
  ).toBe(0.254);
});
