import { test, expect, vi } from "vitest";
import type { BoardScene, Point } from "../../src/lib/board/model";
import { PadShape } from "../../src/lib/board/shapes/pad";

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

test("a single large custom pad yields during vertex generation and can be closed", () => {
  const custom = Array.from({ length: 5000 }, (_, i): Point => {
    const angle = (i * Math.PI * 2) / 5000;
    return [Math.cos(angle), Math.sin(angle)];
  });
  const scene: BoardScene = {
    layers: [{ id: 0, name: "TOP", color: "#ffffff" }],
    nets: new Map(),
    segments: [],
    vias: [],
    zones: [],
    texts: [],
    drawingLayers: [],
    outline: [],
    diagnostics: [],
    bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
    pins: [
      {
        id: 1,
        net: 0,
        at: [0, 0],
        reference: "U1",
        name: "1",
        angle: 0,
        back: false,
        drill: 0,
        shapes: [
          {
            layer: 0,
            type: 22,
            width: 2,
            height: 2,
            offset: [0, 0],
            custom: [custom],
          },
        ],
      },
    ],
  };
  const transform = vi.spyOn(PadShape.prototype, "toWorld");
  try {
    const steps = new PrimitiveBatchBuilder(scene).buildSteps();
    const step = steps.next();
    expect(step.done).toBe(false);
    expect(step.value).toBeUndefined();
    expect(transform.mock.calls.length).toBeGreaterThan(0);
    expect(transform.mock.calls.length).toBeLessThan(custom.length);
    steps.return(undefined);
    expect(steps.next().done).toBe(true);
  } finally {
    transform.mockRestore();
  }
});
