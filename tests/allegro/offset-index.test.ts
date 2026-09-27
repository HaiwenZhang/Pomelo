import { test, expect } from "vitest";

import { OffsetIndex } from "../../src/lib/allegro/binary/offset-index";

test("duplicate add preserves narrow storage while set can promote and replace the offset", () => {
  const index = new OffsetIndex();
  index.add(42, 0);
  const initialStorageBytes = index.storageBytes;
  const largeOffset = 2 ** 32 + 123;

  expect(index.add(42, largeOffset)).toBe(false);
  expect(index.get(42)).toBe(0);
  expect(index.has(42)).toBe(true);
  expect(index.size).toBe(1);
  expect(index.storageBytes).toBe(initialStorageBytes);

  expect(index.set(42, largeOffset)).toBe(index);
  expect(index.get(42)).toBe(largeOffset);
  expect(index.size).toBe(1);
  expect(index.storageBytes).toBe(initialStorageBytes * 1.5);
});

test("zero record ID stores wide offsets without allocating a bucket or aliasing invalid IDs", () => {
  const index = new OffsetIndex();
  expect(index.add(0, Number.MAX_SAFE_INTEGER)).toBe(true);
  expect(index.add(0, 123)).toBe(false);
  expect(index.get(0)).toBe(Number.MAX_SAFE_INTEGER);
  expect(index.size).toBe(1);
  expect(index.storageBytes).toBe(0);

  expect(index.set(0, 0)).toBe(index);
  expect(index.has(0)).toBe(true);
  expect(index.get(0)).toBe(0);
  for (const recordId of [
    NaN,
    Infinity,
    -1,
    2 ** 32,
    1.5,
    undefined as unknown as number,
  ]) {
    expect(index.has(recordId)).toBe(false);
    expect(index.get(recordId)).toBe(undefined);
  }
  expect(() => index.set(0, -1)).toThrow(/offset/);
  expect(() => index.add(0, Number.MAX_SAFE_INTEGER + 1)).toThrow(/offset/);
  expect(index.get(0)).toBe(0);
  expect(index.size).toBe(1);
  expect(index.storageBytes).toBe(0);
});

test("unsigned record IDs and safe integer offsets remain exact", () => {
  const index = new OffsetIndex();
  const entries = [
    [0, 0],
    [1, 2 ** 32 + 4],
    [0x7fffffff, Number.MAX_SAFE_INTEGER],
    [0x80000000, 682233176],
    [0xffffffff, 4],
  ];
  for (const [key, offset] of entries)
    expect(index.add(key, offset)).toBe(true);
  expect(index.size).toBe(entries.length);
  for (const [key, offset] of entries) {
    expect(index.get(key)).toBe(offset);
    expect(index.has(key)).toBe(true);
    expect(index.add(key, 123)).toBe(false);
    expect(index.get(key)).toBe(offset);
  }
  expect(index.size).toBe(entries.length);
  index.set(0, 99);
  index.set(0xffffffff, 88);
  expect(index.get(0)).toBe(99);
  expect(index.get(0xffffffff)).toBe(88);
  expect(index.size).toBe(entries.length);
  for (const key of [
    2,
    -1,
    2 ** 32,
    NaN,
    Infinity,
    1.5,
    undefined as unknown as number,
  ])
    expect(index.get(key)).toBe(undefined);
  for (const [key, offset] of [
    [-1, 0],
    [2 ** 32, 0],
    [1.5, 0],
    [1, -1],
    [1, Number.MAX_SAFE_INTEGER + 1],
    [1, NaN],
  ])
    expect(() => index.add(key, offset)).toThrow(/ID|offset/);
});

test("growth and updates preserve sequential, aligned pointer and mixed IDs against Map", () => {
  const index = new OffsetIndex(),
    expected = new Map<number, number>();
  let random = 0x12345678;
  for (let i = 0; i < 500000; i++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const key =
      i % 3 === 0 ? i : i % 3 === 1 ? (0x80000000 + i * 8) >>> 0 : random;
    const value = i * 40 + 2 ** 32;
    expect(index.add(key, value)).toBe(!expected.has(key));
    if (!expected.has(key)) expected.set(key, value);
    if (i % 127 === 0) {
      index.set(key, value + 4);
      expected.set(key, value + 4);
    }
  }
  expect(index.size).toBe(expected.size);
  for (const [key, value] of expected)
    expect(index.get(key), `ID ${key}`).toBe(value);
  for (let i = 0; i < 10000; i++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    expect(index.get(random)).toBe(expected.get(random));
  }
}, 15_000);

test("narrow offset storage promotes without truncating existing values or later growth", () => {
  const index = new OffsetIndex(),
    expected = new Map<number, number>();
  for (let key = 1; key <= 40000; key++) {
    const value = 0xffffffff - key;
    index.add(key, value);
    expected.set(key, value);
  }
  const narrowBytes = index.storageBytes;
  // Updating every occupied slot must promote every bucket, without changing keys/capacity.
  for (const [key, value] of expected) {
    index.set(key, value + 2 ** 32);
    expected.set(key, value + 2 ** 32);
  }
  expect(index.storageBytes).toBe(narrowBytes * 1.5);
  for (let key = 40001; key <= 200000; key++) {
    const value = key % 2 ? key : Number.MAX_SAFE_INTEGER - key;
    index.add(key, value);
    expected.set(key, value);
  }
  for (const [key, value] of expected) expect(index.get(key)).toBe(value);
  expect(index.size).toBe(expected.size);
});
