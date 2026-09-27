import { test, expect } from "vitest";

import {
  KiCadExpressionReader,
  kiCadAtom,
  kiCadChild,
  kiCadChildren,
  kiCadNumber,
  parseKiCadExpression,
} from "../../src/lib/kicad/syntax/sexpr";

test("should retain Unicode and escaped tokens when reading a bounded expression", () => {
  const source = new TextEncoder().encode(
    'prefix (node "层一\\n\\t\\\"" # ignored (\n (xy -0 2e-3) (xy 3 4)) suffix',
  );
  const start = 7,
    end = source.length - 7;
  const node = parseKiCadExpression(source, { start, end });
  expect(kiCadAtom(node)).toBe('层一\n\t"');
  expect(kiCadChildren(node, "xy").length).toBe(2);
  const first = kiCadChild(node, "xy")!;
  expect(Object.is(kiCadNumber(first), -0)).toBeTruthy();
  expect(kiCadNumber(first, 1)).toBe(0.002);
});

test("should reject invalid input when a span is truncated or contains trailing data", () => {
  for (const text of ['(a "unfinished)', '(a "escape\\', "(a 1", "(a) (b)"]) {
    const bytes = new TextEncoder().encode(text);
    expect(() =>
      parseKiCadExpression(bytes, { start: 0, end: bytes.length }),
    ).toThrow();
  }
  const invalid = new Uint8Array([40, 97, 32, 34, 0xff, 34, 41]);
  expect(() =>
    parseKiCadExpression(invalid, { start: 0, end: invalid.length }),
  ).toThrow(TypeError);
  expect(() => parseKiCadExpression(invalid, { start: -1, end: 2 })).toThrow(
    /范围/,
  );
});

test("should isolate cursors when reading different spans after a failed expression", () => {
  const source = new TextEncoder().encode('(bad "oops)(net 2 "GND")');
  const reader = new KiCadExpressionReader(source);
  expect(() => reader.read({ start: 0, end: 11 })).toThrow(/未闭合/);
  expect(reader.read({ start: 11, end: source.length })).toStrictEqual({
    head: "net",
    values: ["2", "GND"],
  });
  expect(reader.read({ start: 11, end: source.length })).toStrictEqual({
    head: "net",
    values: ["2", "GND"],
  });
});
