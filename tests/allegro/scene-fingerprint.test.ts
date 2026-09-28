import { expect, test } from "vitest";
import { fingerprint } from "../../scripts/scene-fingerprint";

test("scene fingerprints encode unambiguous types, lengths and boundaries", () => {
  const values = [
    [1, 23],
    [12, 3],
    ["1", 23],
    [1, "23"],
    "123",
    123,
    [[1], [23]],
    [undefined],
    new Array(1),
    [],
    undefined,
    null,
    true,
    false,
    "\ud800",
    "\ud801",
    "\ufffd",
  ];
  expect(new Set(values.map(fingerprint)).size).toBe(values.length);
});

test("numeric fingerprints retain IEEE-754 values including negative zero and NaN", () => {
  const values = [0, -0, NaN, Infinity, -Infinity, Number.MIN_VALUE, null];
  expect(new Set(values.map(fingerprint)).size).toBe(values.length);
  const bits = Buffer.alloc(8);
  bits.writeBigUInt64BE(0x7ff8000000000001n);
  const firstNaN = bits.readDoubleBE();
  bits.writeBigUInt64BE(0x7ff8000000000002n);
  const secondNaN = bits.readDoubleBE();
  expect(Number.isNaN(firstNaN) && Number.isNaN(secondNaN)).toBe(true);
  expect(fingerprint(firstNaN)).not.toBe(fingerprint(secondNaN));
});

test("plain objects sort keys and shared objects compare by content", () => {
  expect(fingerprint({ b: [2, 3], a: 1 })).toBe(
    fingerprint({ a: 1, b: [2, 3] }),
  );
  expect(fingerprint({ a: undefined })).not.toBe(fingerprint({}));
  const shared = { x: 1 };
  expect(fingerprint([shared, shared])).toBe(fingerprint([{ x: 1 }, { x: 1 }]));
});

test("view fingerprints include constructor and only the exposed bytes", () => {
  const bytes = Uint8Array.from([99, 1, 2, 88]);
  expect(fingerprint(bytes.subarray(1, 3))).toBe(
    fingerprint(Uint8Array.from([1, 2])),
  );
  expect(fingerprint(Uint8Array.from([1, 2]))).not.toBe(
    fingerprint(Int8Array.from([1, 2])),
  );
  expect(fingerprint(new DataView(bytes.buffer, 1, 2))).not.toBe(
    fingerprint(bytes.subarray(1, 3)),
  );
});

test("Map fingerprints retain iteration order and entry boundaries", () => {
  expect(fingerprint(new Map([[1, 23]]))).not.toBe(
    fingerprint(new Map([[12, 3]])),
  );
  expect(
    fingerprint(
      new Map([
        [1, 2],
        [3, 4],
      ]),
    ),
  ).not.toBe(
    fingerprint(
      new Map([
        [3, 4],
        [1, 2],
      ]),
    ),
  );
  expect(fingerprint(new Map([[1, 2]]))).not.toBe(fingerprint([[1, 2]]));
});

test("unsupported values and cycles fail explicitly", () => {
  const cyclic: { self?: unknown } = {};
  cyclic.self = cyclic;
  for (const value of [
    1n,
    Symbol("id"),
    () => 1,
    new Date(),
    new Set([1]),
    new ArrayBuffer(1),
    { [Symbol("id")]: 1 },
    {
      get value() {
        return 1;
      },
    },
    cyclic,
  ])
    expect(() => fingerprint(value)).toThrow(/Unsupported fingerprint value/);
});
