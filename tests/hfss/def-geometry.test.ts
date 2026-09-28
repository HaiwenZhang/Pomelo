import { test, expect } from "vitest";
import { defPolygonPath, defPrimitivePath } from "../../src/lib/hfss/geometry";

test("DEF signed sagitta reproduces native EDB arc center, radius and direction without tessellation", () => {
  const path = defPolygonPath({
    schema: 36,
    offset: 0,
    end: 0,
    fields: [
      1,
      2,
      [
        0.001,
        0.012,
        0.002,
        Number.MAX_VALUE,
        0.011,
        0.012,
        0.011,
        0.014,
        0.001,
        0.014,
      ],
    ],
  });
  expect(path.length).toBe(4);
  const arc = path[0].arc!;
  expect(Math.abs(arc.center[0] - 6) < 1e-12).toBeTruthy();
  expect(Math.abs(arc.center[1] - 6.75) < 1e-12).toBeTruthy();
  expect(Math.abs(arc.radius - 7.25) < 1e-12).toBeTruthy();
  expect(arc.sweep < 0).toBeTruthy();
  const reverse = defPolygonPath({
    schema: 36,
    offset: 0,
    end: 0,
    fields: [0, 2, [0.011, 0.012, -0.002, Number.MAX_VALUE, 0.001, 0.012]],
  })[0].arc!;
  expect(Math.abs(reverse.center[1] - arc.center[1]) < 1e-12).toBeTruthy();
  expect(Math.abs(reverse.sweep + arc.sweep) < 1e-12).toBeTruthy();
  const major = defPolygonPath({
    schema: 36,
    offset: 0,
    end: 0,
    fields: [0, 2, [0, 0, 0.02, Number.MAX_VALUE, 0.01, 0]],
  })[0].arc!;
  expect(major.sweep < -Math.PI).toBeTruthy();
  expect(() =>
    defPolygonPath({
      schema: 36,
      offset: 0,
      end: 0,
      fields: [0, 0, [0, 0, 0.002, Number.MAX_VALUE]],
    }),
  ).toThrow(/缺少端点/);
});

test("DEF rotated round rectangle uses its center and reproduces native fixture tangent points", () => {
  const n = (number: number) => ({ number, expression: "" });
  const path = defPrimitivePath({
    schema: 12,
    offset: 0,
    end: 0,
    fields: [
      null,
      2,
      n(0.018),
      n(0.001),
      n(0.022),
      n(0.003),
      n(0.0003),
      n(Math.PI / 6),
    ],
  });
  expect(path.length).toBe(8);
  const expectedStart = [19.02775681356646, 0.2839745962155641],
    expectedEnd = [21.972243186433545, 1.9839745962155608];
  const edge = path.find(
    (s) =>
      Math.hypot(s.a[0] - expectedStart[0], s.a[1] - expectedStart[1]) < 1e-10,
  )!;
  expect(edge).toBeTruthy();
  expect(
    Math.hypot(edge.b[0] - expectedEnd[0], edge.b[1] - expectedEnd[1]) < 1e-10,
  ).toBeTruthy();
  expect(edge.arc).toBe(undefined);
  expect(
    path
      .filter((s) => s.arc)
      .every((s) => Math.abs(s.arc!.radius - 0.3) < 1e-12 && s.arc!.sweep > 0),
  ).toBeTruthy();
});
