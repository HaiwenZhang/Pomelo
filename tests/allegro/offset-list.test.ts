import { expect, test } from "vitest";
import { OffsetList } from "../../src/lib/allegro/binary/offset-list";

test("offset pages retain order across growth, including zero and uint32 limits", () => {
  const offsets = new OffsetList();
  expect([...offsets]).toEqual([]);
  expect(offsets.storageBytes).toBe(0);
  const expected = Array.from({ length: 20_000 }, (_, i) => i * 100);
  expected[0] = 0;
  expected[100] = 0xffffffff;
  for (const offset of expected) offsets.push(offset);
  expect(offsets.length).toBe(expected.length);
  expect([...offsets]).toEqual(expected);
  expect(offsets.storageBytes).toBeLessThanOrEqual(
    (expected.length + 4095) * 4,
  );
  // Readers have independent cursors and never expose unused page capacity.
  const a = offsets[Symbol.iterator](),
    b = offsets[Symbol.iterator]();
  expect(a.next().value).toBe(0);
  expect(a.next().value).toBe(100);
  expect(b.next().value).toBe(0);
});

test("wide offsets survive promotion, growth and subsequent narrow pages", () => {
  const offsets = new OffsetList();
  const expected = Array.from({ length: 9000 }, (_, i) => i * 4);
  expected[1] = 2 ** 32;
  expected[4100] = Number.MAX_SAFE_INTEGER;
  for (const offset of expected) offsets.push(offset);
  expect([...offsets]).toEqual(expected);
  expect(offsets.storageBytes).toBe(4096 * (8 + 8 + 4));
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    expect(() => offsets.push(value)).toThrow(/offset/);
  expect(offsets.length).toBe(expected.length);
  expect([...offsets]).toEqual(expected);
});
