import { test, expect } from "vitest";
import { readDef } from "../../src/lib/hfss/binary/def";
import { binaryFixture as fixture, u32, f64, string } from "./def-test-utils";

test("DEF declared field types retain numeric bits, cached expressions, UTF-8 and heterogeneous properties", async () => {
  const result = await readDef(
    fixture(
      [0, 1, 2, 3, 4, 5, 6, 7],
      [
        Buffer.from([1]),
        u32(-17),
        f64(-0),
        f64(0.0004),
        string("w"),
        string("层一"),
        u32(-1),
        u32(2),
        u32(2),
        f64(0.001),
        f64(0.002),
        u32(2),
        u32(1),
        u32(28),
        u32(4),
        string("True"),
      ],
    ),
  );
  expect(result.root.fields).toStrictEqual([
    1,
    -17,
    -0,
    { number: 0.0004, expression: "w" },
    "层一",
    null,
    [0.001, 0.002],
    [28, "True"],
  ]);
  expect(Object.is(result.root.fields[2], -0)).toBeTruthy();
  expect(result.counts.get(0)).toBe(1);
  expect(result.version).toBe("12.1");
});

test("DEF bounds, root framing, unsupported versions/encodings and invalid text fail explicitly", async () => {
  const good = fixture([4], [string("x")]);
  await expect(readDef(good.slice(0, -1))).rejects.toThrow(/截断/);
  const extra = new Uint8Array(good.byteLength + 4);
  extra.set(new Uint8Array(good));
  await expect(readDef(extra.buffer)).rejects.toThrow(/长度/);
  await expect(readDef(fixture([], [], "99.1"))).rejects.toThrow(/版本/);
  await expect(readDef(fixture([8], []))).rejects.toThrow(/值类型 8/);
  await expect(readDef(fixture([4], [u32(0x7fffffff)]))).rejects.toThrow(
    /截断/,
  );
  await expect(
    readDef(fixture([4], [u32(2), Buffer.from([0xc0, 0xff])])),
  ).rejects.toThrow(/UTF-8/);
  await expect(
    readDef(fixture([6], [u32(1), u32(0xffffffff)])),
  ).rejects.toThrow(/数组/);
  expect(
    (await readDef(fixture([6], [u32(0), u32(0xffffffff)]))).root.fields,
  ).toStrictEqual([[]]);
});

test("DEF yields during a large numeric vector and accepts a fresh import after cancellation", async () => {
  const input = fixture([6], [u32(1_000_000), u32(2), Buffer.alloc(8_000_000)]),
    controller = new AbortController();
  const task = readDef(input, controller.signal),
    timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    clearTimeout(timer);
  }
  expect((await readDef(fixture([], []))).root.schema).toBe(0);
});
