import { expect, test } from "vitest";
import type { BrdDatabase } from "../../src/lib/allegro/database";
import { AllegroBuildProgress } from "../../src/lib/allegro/build-progress";
import { AllegroSceneContext } from "../../src/lib/allegro/scene/context";
import { buildGraphics } from "../../src/lib/allegro/scene/graphics";

test("a board containing only a graphic outline has finite bounds including arc extrema", async () => {
  const graphic = { type: 20, Key: 1, Layer: 0xea01, SegmentPtr: 2 };
  const edge = {
    type: 1,
    Key: 2,
    Next: 0,
    StartX: 10,
    StartY: 0,
    EndX: -10,
    EndY: 0,
    CenterX: 0,
    CenterY: 0,
    Width: 0,
    SubType: 0,
  };
  const db = {
    header: { textList: { head: 0, tail: 0 } },
    strings: new Map(),
    records: (type: number) => (type === 20 ? [graphic] : []),
    get: (id: number) => (id === 2 ? edge : undefined),
  } as unknown as BrdDatabase;
  const context = new AllegroSceneContext(
    db,
    1,
    [],
    new AllegroBuildProgress(),
  );
  await buildGraphics(context, []);
  expect(context.bounds).toEqual({ minX: -10, minY: 0, maxX: 10, maxY: 10 });
});
