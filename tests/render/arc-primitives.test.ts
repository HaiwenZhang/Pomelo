import { test, expect } from "vitest";

import { ArcBatchBuilder } from "../../src/lib/render/arc-batch-builder";

test("arc packets retain real radius, endpoint, width and bounds precision", () => {
  const center = [-958.8637160024715, -1716.2719675042774],
    r = 2175.698341856357,
    start = 1.0470741672048678,
    sweep = -0.0003943761903404397,
    width = 0.0889;
  const straight = [0, 0, 1, 1, 0.2, 0, 0, 0, 0.2, 0.6, 0.8, 1];
  const input = [
    ...straight,
    ...center,
    r,
    start,
    width,
    sweep,
    1,
    0,
    0.2,
    0.6,
    0.8,
    1,
    ...straight,
  ];
  const batches = ArcBatchBuilder.build({ layer: 3, category: "etch" }, input);
  expect(batches.length).toBe(2);
  expect([...batches[0].data]).toStrictEqual(
    new Array(2).fill(straight).flat().map(Math.fround),
  );
  const arc = batches[1];
  expect(arc.arcs).toBe(true);
  expect(arc.layer).toBe(3);
  expect(arc.category).toBe("etch");
  const exact = (i: number) => arc.data[i] + arc.residual[i];
  for (const [i, value] of [
    [0, center[0]],
    [1, center[1]],
    [2, r],
    [3, width],
    [4, center[0] + r * Math.cos(start)],
    [5, center[1] + r * Math.sin(start)],
    [6, center[0] + r * Math.cos(start + sweep)],
    [7, center[1] + r * Math.sin(start + sweep)],
  ])
    expect(Math.abs(exact(i) - value) < 1e-11).toBeTruthy();
  expect(arc.data[16]).toBe(-1);
  expect(arc.data[17]).toBe(0);
  expect(arc.data[18]).toBe(0);
  expect(exact(10) - exact(8) < 1).toBeTruthy();
  expect(exact(11) - exact(9) < 1).toBeTruthy();
});

test("outline arcs retain display metadata and full/major/zero sweep distinctions", () => {
  for (const sweep of [0, Math.PI, Math.PI * 1.5, -Math.PI * 2]) {
    const [arc] = ArcBatchBuilder.build(
      { layer: 2, category: "pin", padMode: "outline" },
      [0, 0, 3, 1, 0, sweep, 1, 0, 1, 1, 1, 1],
    );
    expect(arc.padMode).toBe("outline");
    expect(arc.category).toBe("pin");
    expect(arc.data[16]).toBe(Math.sign(sweep));
    expect(arc.data[17]).toBe(Math.abs(sweep) > Math.PI ? 1 : 0);
    expect(arc.data[18]).toBe(Math.abs(sweep) >= Math.PI * 2 ? 1 : 0);
  }
});

test("large curve preparation can close during counting or conversion without reading the rest", () => {
  const count = 8192,
    source = Array.from({ length: count }, (_, i) => [
      i + 0.123456789,
      -i - 0.987654321,
      3,
      1,
      0.2,
      Math.PI * 1.5,
      1,
      0,
      0.2,
      0.6,
      0.8,
      1,
    ]).flat();
  let reads = 0;
  const input = new Proxy(source, {
    get(target, key, receiver) {
      if (typeof key === "string" && /^\d+$/.test(key)) reads++;
      return Reflect.get(target, key, receiver);
    },
  });
  const meta = { layer: 3, category: "etch" as const };
  const counting = ArcBatchBuilder.buildSteps(meta, input);
  expect(counting.next().done).toBe(false);
  expect(reads).toBe(2048);
  counting.return([]);
  expect(counting.next().done).toBe(true);
  expect(reads).toBe(2048);
  reads = 0;
  const converting = ArcBatchBuilder.buildSteps(meta, input);
  for (let i = 0; i < count / 2048; i++)
    expect(converting.next().done).toBe(false);
  expect(reads, "only tags read before conversion").toBe(count);
  expect(converting.next().done).toBe(false);
  const partial = reads;
  expect(partial > count && partial < count + 512 * 32).toBeTruthy();
  converting.return([]);
  expect(converting.next().done).toBe(true);
  expect(reads).toBe(partial);
  const [retry] = ArcBatchBuilder.build(meta, source);
  expect(retry.data.length).toBe(count * 20);
  expect(retry.residual.length).toBe(count * 12);
  for (const i of [0, 511, 512, count - 1]) {
    expect(retry.data[i * 20]).toBe(Math.fround(source[i * 12]));
    expect(retry.residual[i * 12]).toBe(
      Math.fround(source[i * 12] - Math.fround(source[i * 12])),
    );
    expect(retry.data[i * 20 + 17]).toBe(1);
  }
});

test("interleaved curve conversions and cancellation cannot overwrite another generator or completed packet", () => {
  const meta = { layer: 4, category: "etch" as const };
  const input = (offset: number) =>
    Array.from({ length: 4096 }, (_, i) => [
      offset + i * 0.123456789,
      -offset - i * 0.987654321,
      3 + i * 0.01,
      i * 0.02,
      0.2,
      ((i % 3) - 1) * Math.PI * 1.5,
      1,
      0,
      0.2,
      0.6,
      0.8,
      1,
    ]).flat();
  const a = input(10000),
    b = input(-20000),
    expected = ArcBatchBuilder.build(meta, a);
  const left = ArcBatchBuilder.buildSteps(meta, a),
    right = ArcBatchBuilder.buildSteps(meta, b);
  // Pass counting and suspend both converters after the first 512 records.
  for (let i = 0; i < 3; i++) {
    expect(left.next().done).toBe(false);
    expect(right.next().done).toBe(false);
  }
  right.return([]);
  const other = ArcBatchBuilder.build(meta, b);
  let step = left.next();
  while (!step.done) step = left.next();
  expect(step.value).toStrictEqual(expected);
  const saved = other.map((batch) => ({
    data: batch.data.slice(),
    residual: batch.residual.slice(),
  }));
  ArcBatchBuilder.build(meta, a);
  expect(other.map(({ data, residual }) => ({ data, residual }))).toStrictEqual(
    saved,
  );
});
