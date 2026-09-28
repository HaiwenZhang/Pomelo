import { expect, test, vi } from "vitest";
import { DrawBundleCache } from "../../src/lib/render/draw-bundle-cache";
import { GpuGeometry } from "../../src/lib/render/gpu-geometry";
import type { GpuBatch } from "../../src/lib/render/webgpu-batch-uploader";

test("stable ranges replay, range/binding changes draw directly, disposed owners invalidate", () => {
  const target = () => ({
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    draw: vi.fn(),
    executeBundles: vi.fn(),
    finish: vi.fn(() => ({})),
  });
  const encoder = target(),
    pass = target();
  const createRenderBundleEncoder = vi.fn(() => encoder);
  const cache = new DrawBundleCache(
    { createRenderBundleEncoder } as unknown as GPUDevice,
    "bgra8unorm",
  );
  const owner = new GpuGeometry([]),
    batch = { owner } as GpuBatch;
  const pipeline = {} as GPURenderPipeline,
    bind = {} as GPUBindGroup;
  const ranges = [0, 32, 64, 32, 128, 32, 192, 32, 256, 32];
  const draw = (group = bind, values = ranges) =>
    cache.draw(
      pass as unknown as GPURenderPassEncoder,
      batch,
      pipeline,
      group,
      values,
    );
  draw();
  expect(pass.draw).toHaveBeenCalledTimes(5);
  expect(createRenderBundleEncoder).not.toHaveBeenCalled();
  draw();
  draw();
  expect(createRenderBundleEncoder).toHaveBeenCalledOnce();
  expect(pass.executeBundles).toHaveBeenCalledTimes(2);
  expect(encoder.draw.mock.calls).toEqual(pass.draw.mock.calls);
  draw(bind, [...ranges.slice(0, -1), 16]);
  expect(pass.draw).toHaveBeenCalledTimes(10);
  draw({} as GPUBindGroup);
  expect(pass.draw).toHaveBeenCalledTimes(15);
  owner.dispose();
  draw();
  expect(pass.draw).toHaveBeenCalledTimes(15);
  cache.dispose();
});
