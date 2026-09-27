import { test, expect } from "vitest";

import { buildPadsOutlineSegments } from "../../src/lib/pads/scene/outline-scene";
import { PADS_BASIC_TO_MM } from "../../src/lib/pads/binary/metadata";
import type { readPadsOutlines } from "../../src/lib/pads/binary/outlines";

type Source = Awaited<ReturnType<typeof readPadsOutlines>>;
const raw = 381000,
  radius = raw * PADS_BASIC_TO_MM;
const vertex = (at: [number, number], arcBox: number[] | null = null) => ({
  at,
  attribute: arcBox ? 0 : -1,
  arcBox,
});
const source = (vertices: ReturnType<typeof vertex>[], box?: number[]) =>
  ({
    owners: [{ index: 2, origin: [0, 0] }],
    outlines: [
      {
        owner: 2,
        piece: 3,
        width: 0.1,
        vertices: box
          ? [{ ...vertices[0], arcBox: box }, ...vertices.slice(1)]
          : vertices,
      },
    ],
  }) as Source;

test("PADS dedicated board outline maps arc box and owner-relative center into scene geometry", async () => {
  const segments = await buildPadsOutlineSegments(
    source(
      [vertex([radius, 0]), vertex([0, radius])],
      [-raw, -raw, raw, raw, 58982400],
    ),
  );
  expect(segments.length).toBe(1);
  expect(segments[0].layer).toBe(-1);
  expect(segments[0].width).toBe(0.1);
  expect(segments[0].arc?.center).toStrictEqual([0, 0]);
  expect(Math.abs(segments[0].arc!.radius - radius) < 1e-12).toBeTruthy();
  expect(Math.abs(segments[0].arc!.sweep - Math.PI / 2) < 1e-12).toBeTruthy();
});

test("PADS half-circle direction uses the signed source arc payload and invalid circles fail", async () => {
  const box = [-raw, -raw, raw, raw, -117964800];
  const segment = (
    await buildPadsOutlineSegments(
      source([vertex([-radius, 0]), vertex([radius, 0])], box),
    )
  )[0];
  expect(segment.arc?.sweep).toBe(-Math.PI);
  await expect(
    buildPadsOutlineSegments(
      source(
        [vertex([-radius, 0]), vertex([radius, 0])],
        [-raw, -raw, raw, raw / 2, 1],
      ),
    ),
  ).rejects.toThrow(/半径不一致/);
});

test("PADS board outline cancellation stops conversion", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    buildPadsOutlineSegments(
      source([vertex([0, 0]), vertex([1, 0])]),
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" });
});
