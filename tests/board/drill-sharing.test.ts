import { test, expect } from "vitest";

import type { DrillShape, Via } from "../../src/lib/board/model";
import { DrillShape as DrillShapeGeometry } from "../../src/lib/board/shapes/drill";
import { PadShape } from "../../src/lib/board/shapes/pad";

const via = (drillShape?: DrillShape): Via => ({
  id: 1,
  net: 1,
  at: [0, 0],
  drill: 9,
  padstack: 1,
  startLayer: 0,
  endLayer: 3,
  pads: [],
  drillShape,
});

test("immutable shared drill definition reuses local geometry across owners without sharing placement", () => {
  const shape = { width: 0.6, height: 1.2, plated: true },
    a = via(shape),
    b = {
      ...via(shape),
      id: 2,
      at: [10, 20] as [number, number],
      angle: Math.PI / 2,
    };
  const first = new DrillShapeGeometry(a).pad()!,
    second = new DrillShapeGeometry(b).pad()!;
  expect(first).toBe(second);
  expect(first.type).toBe(11);
  expect(first).toStrictEqual({
    layer: -1,
    type: 11,
    width: 0.6,
    height: 1.2,
    offset: [0, 0],
    corner: 0,
  });
  expect(new PadShape(first).bounds(a)).toStrictEqual({
    minX: -0.3,
    minY: -0.6,
    maxX: 0.3,
    maxY: 0.6,
  });
  const bounds = new PadShape(second).bounds(b);
  expect(Math.abs(bounds.minX - 9.4) < 1e-12).toBeTruthy();
  expect(Math.abs(bounds.maxY - 20.3) < 1e-12).toBeTruthy();
  expect(new PadShape(second).distance([10.5, 20], b) < 0).toBeTruthy();
  expect(new PadShape(second).distance([10, 20.5], b) > 0).toBeTruthy();
  expect(a.at).toStrictEqual([0, 0]);
  expect(shape).toStrictEqual({ width: 0.6, height: 1.2, plated: true });
});

test("drill cache keeps definitions independent, preserves empty holes and supports scalar-only fixtures", () => {
  const circle = via({ width: 0.5, height: 0.5, plated: true }),
    empty = via({ width: 0, height: 0, plated: false });
  expect(new DrillShapeGeometry(circle).pad()?.type).toBe(2);
  expect(new DrillShapeGeometry(empty).pad()).toBe(null);
  expect(new DrillShapeGeometry(empty).pad()).toBe(null);
  const other = via({ width: 0.5, height: 0.8, plated: false });
  expect(new DrillShapeGeometry(other).pad()).not.toBe(
    new DrillShapeGeometry(circle).pad(),
  );
  expect(new DrillShapeGeometry(other).pad()?.height).toBe(0.8);
  const oldDefinition = circle.drillShape;
  circle.drillShape = { width: 0.7, height: 0.7, plated: true };
  expect(new DrillShapeGeometry(circle).pad()?.width).toBe(0.7);
  expect(new DrillShapeGeometry(via(oldDefinition)).pad()?.width).toBe(0.5);
  const fallback = via();
  fallback.drill = 0.25;
  expect(new DrillShapeGeometry(fallback).pad()?.width).toBe(0.25);
  fallback.drill = 0.4;
  expect(new DrillShapeGeometry(fallback).pad()?.width).toBe(0.4);
  fallback.drill = 0;
  expect(new DrillShapeGeometry(fallback).pad()).toBe(null);
});
