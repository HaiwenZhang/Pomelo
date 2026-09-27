import { test, expect } from "vitest";

import { resolvePadsPadLayers } from "../../src/lib/pads/scene/pad-layers";
import type { PadsLayer } from "../../src/lib/pads/binary/metadata";
import type {
  PadsPadLayer,
  PadsPadstack,
} from "../../src/lib/pads/binary/padstack";
const layers = [1, 2, 3, 4].map((id) => ({ id, type: 1 })) as PadsLayer[];
const row = (selector: number, width: number, shapeCode = 2): PadsPadLayer => ({
  selector,
  rawSelector: selector,
  width,
  shapeCode,
  second: 0,
  sourceOffset: selector,
  metadataOffset: selector,
  shapeOffset: selector + 1,
});
const stack = (rows: PadsPadLayer[]): PadsPadstack => ({
  index: 0,
  active: true,
  sourceOffset: 0,
  shapeCode: 2,
  width: 1,
  drill: 0.4,
  fingerLength: 0,
  fingerOffset: 0,
  angle: 0,
  drillStart: 0,
  drillEnd: 0,
  slotLength: 0,
  slotAngle: 0,
  layers: rows,
});
test("PADS layer selection preserves distinct front/inner/back dimensions and explicit priority when flipped", () => {
  const p = stack([row(0, 0.8), row(2, 0.7), row(255, 1.2)]);
  const result = resolvePadsPadLayers(p, layers, 0x2024, true);
  expect(
    result.geometries.map((g) => [
      g.layer,
      g.sourceLayer,
      g.geometry.shape.width,
    ]),
  ).toStrictEqual([
    [3, 4, 1],
    [2, 3, 0.7],
    [1, 2, 0.8],
    [0, 1, 1.2],
  ]);
  expect(result.unresolved).toStrictEqual([]);
});
test("PADS distinguishes zero copper, non-copper, thermal relief and clearance rows", () => {
  const result = resolvePadsPadLayers(
    stack([row(255, 0), row(23, 2), row(0, 2, 6), row(0, 3, 8)]),
    layers,
    0x2026,
  );
  expect(result.geometries.map((g) => g.layer)).toStrictEqual([0, 1, 2]);
  expect(result.nonCopper.length).toBe(1);
  expect(result.reliefs.length).toBe(1);
  expect(result.clearances.length).toBe(1);
});
test("PADS conflicting inner definitions are reported and SMD defaults stay on the placed side", () => {
  const r = resolvePadsPadLayers(
    stack([row(0, 0.8), row(0, 1.2)]),
    layers,
    0x2026,
  );
  expect(r.unresolved.map((d) => d.layer)).toStrictEqual([1, 2]);
  expect(r.geometries.map((g) => g.layer)).toStrictEqual([0, 3]);
  const smd = resolvePadsPadLayers(
    { ...stack([]), drill: 0 },
    layers,
    0x2026,
    true,
  );
  expect(smd.geometries.map((g) => g.layer)).toStrictEqual([3]);
});

test("PADS zero front copper preserves the exact explicit back pad without scaling", () => {
  const p = {
    ...stack([row(0, 0), { ...row(255, 1.016, 0), second: 5.08 }]),
    width: 0,
    drill: 0,
  };
  const front = resolvePadsPadLayers(p, layers, 0x2024);
  expect(
    front.geometries.map((g) => [
      g.layer,
      g.geometry.shape.width,
      g.geometry.shape.height,
    ]),
  ).toStrictEqual([[3, 5.08, 1.016]]);
  expect(front.unresolved).toStrictEqual([]);
  expect(
    resolvePadsPadLayers(p, layers, 0x2024, true).geometries.map(
      (g) => g.layer,
    ),
  ).toStrictEqual([0]);
});
