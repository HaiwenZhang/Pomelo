import { test, expect } from "vitest";
import type { BoardScene } from "../../src/lib/board/model";

import { PrimitiveBatchBuilder } from "../../src/lib/render/primitive-batch-builder";

test("copper upload preparation advances through every vertex and terminates", () => {
  const scene: BoardScene = {
    layers: [{ id: 0, name: "TOP", color: "#40ffff" }],
    nets: new Map(),
    segments: [],
    pins: [],
    vias: [],
    texts: [],
    drawingLayers: [],
    outline: [],
    diagnostics: [],
    bounds: { minX: 0, minY: 0, maxX: 2, maxY: 2 },
    zones: [
      {
        id: 1,
        net: 0,
        layer: 0,
        rings: [],
        paths: [],
        points: new Float64Array([0, 0, 2, 0, 0, 2]),
        indices: new Uint32Array([0, 1, 2]),
        outerCount: 3,
      },
    ],
  };
  const steps = new PrimitiveBatchBuilder(scene).buildSteps();
  let found = false,
    complete = false;
  for (let i = 0; i < 32; i++) {
    const step = steps.next();
    if (step.done) {
      complete = true;
      break;
    }
    if (step.value?.category === "zone") {
      expect([...step.value.data]).toStrictEqual([-1, -1, 1, -1, -1, 1]);
      found = true;
    }
  }
  steps.return(undefined);
  expect(
    complete,
    "Preparation failed to terminate within its small input budget",
  ).toBeTruthy();
  expect(found).toBeTruthy();
});
