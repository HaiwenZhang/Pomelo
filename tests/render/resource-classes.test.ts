import { test, expect } from "vitest";

import { CurveFillLayer } from "../../src/lib/render/curve-fill-layer";
import { LabelAtlas, LabelLayer } from "../../src/lib/render/label-atlas";

test("curve fill layer owns its pipelines and releases cached resources", async () => {
  const pipelines: object[] = [];
  const device = {
    createRenderPipelineAsync: async () => {
      const pipeline = {};
      pipelines.push(pipeline);
      return pipeline;
    },
  } as unknown as GPUDevice;
  const descriptor = {
    fragment: { targets: [{ format: "rgba8unorm" }] },
  } as unknown as GPURenderPipelineDescriptor;
  const layer = await CurveFillLayer.create(device, descriptor);
  expect(pipelines.length).toBe(5);
  const zone = { paths: [[{ arc: {} }]] } as never;
  expect(layer.eligible(zone, 1001, 1)).toBe(true);
  expect(layer.eligible(zone, 1000, 1)).toBe(false);
  layer.clear();
  layer.dispose();
});

test("label layer clears its own GPU buffers", () => {
  const usageBefore = (globalThis as { GPUBufferUsage?: unknown })
    .GPUBufferUsage;
  (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage = {
    VERTEX: 1,
    COPY_DST: 2,
  };
  let destroyed = 0;
  const device = {
    queue: { writeBuffer() {} },
    createBuffer: () => ({
      destroy() {
        destroyed++;
      },
    }),
  } as unknown as GPUDevice;
  try {
    expect(typeof LabelAtlas.create).toBe("function");
    const layer = new LabelLayer(
      device,
      {} as GPURenderPipeline,
      {} as GPURenderPipeline,
      {} as GPUBindGroup,
      { size: 1, range: 1, glyphs: {} },
    );
    layer.update(new Map([["net", Array(16).fill(0)]]));
    expect(layer.has("net")).toBe(true);
    layer.dispose();
    expect(destroyed).toBe(2);
    expect(layer.has("net")).toBe(false);
  } finally {
    (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage = usageBefore;
  }
});
