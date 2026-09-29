import { test, expect } from "vitest";

import {
  splitPositions,
  splitPositionSteps,
} from "../../src/lib/render/position-precision";

test("split positions retain subpixel differences lost at board-scale float32 coordinates", () => {
  const scale = 1e7,
    positions = [137.123456789, -84.789123456, 137.123456889, -84.789123556];
  const split = splitPositions(positions, 2, 2);
  expect(split.data[0]).toBe(split.data[2]);
  expect(split.data[1]).toBe(split.data[3]);
  for (let i = 0; i < positions.length; i++)
    expect(
      Math.abs(split.data[i] + split.residual[i] - positions[i]) * scale <
        0.00001,
    ).toBeTruthy();
  // Reproduce individual WGSL f32 operations for a point 1 screen pixel away.
  const f = Math.fround;
  const delta = f(
    f(split.data[2] - split.data[0]) + f(split.residual[2] - split.residual[0]),
  );
  expect(Math.abs(delta * scale - 1) < 0.00001).toBeTruthy();
});

test("static endpoint, triangle and glyph records keep attributes separate from coordinate tails", () => {
  for (const [stride, components] of [
    [12, 4],
    [6, 2],
    [16, 2],
  ]) {
    const input = Array.from({ length: stride * 2 }, (_, i) =>
      i % stride < components ? 150.123456789 + i * 0.0000001 : 0.7,
    );
    const { data, residual } = splitPositions(input, stride, components);
    expect(residual.length).toBe(components * 2);
    expect(data.length).toBe(input.length);
    for (let record = 0; record < 2; record++)
      for (let i = 0; i < components; i++)
        expect(
          Math.abs(
            data[record * stride + i] +
              residual[record * components + i] -
              input[record * stride + i],
          ) < 1e-12,
        ).toBeTruthy();
    expect(Array.from(data.slice(components, stride))).toStrictEqual(
      Array(stride - components).fill(Math.fround(0.7)),
    );
  }
});

test("large position tails pause without exposing incomplete buffers and can be abandoned", () => {
  const source = Array.from({ length: 8192 * 12 }, (_, i) =>
    i % 12 < 4 ? -0.123456789 + i * 0.0000001 : 0.7,
  );
  let reads = 0;
  const values = { length: source.length } as ArrayLike<number>;
  const input = new Proxy(values, {
    get(target, key) {
      if (typeof key === "string" && /^\d+$/.test(key)) {
        reads++;
        return source[Number(key)];
      }
      return Reflect.get(target, key);
    },
  });
  const steps = splitPositionSteps(input, 12, 4);
  expect(steps.next()).toStrictEqual({ value: undefined, done: false });
  const first = reads;
  expect(first, "native data copy followed by bounded residual work").toBe(
    source.length + 2048 * 4,
  );
  expect(steps.next()).toStrictEqual({ value: undefined, done: false });
  expect(reads - first).toBe(2048 * 4);
  steps.return({ data: new Float32Array(0), residual: new Float32Array(0) });
  const stopped = reads;
  expect(steps.next().done).toBe(true);
  expect(reads).toBe(stopped);
  const retry = splitPositions(source, 12, 4);
  expect(retry.data.length).toBe(source.length);
  expect(retry.residual.length).toBe(8192 * 4);
  for (const record of [0, 2047, 2048, 8191])
    for (let c = 0; c < 4; c++)
      expect(
        Math.abs(
          retry.data[record * 12 + c] +
            retry.residual[record * 4 + c] -
            source[record * 12 + c],
        ) < 1e-12,
      ).toBeTruthy();
});
