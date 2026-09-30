import { test, expect, vi } from "vitest";

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

test("atlas initialization passes cancellation to both font requests", async () => {
  const controller = new AbortController();
  const fetchFont = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.signal).toBe(controller.signal);
    return new Promise<Response>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(controller.signal.reason),
        { once: true },
      );
    });
  });
  vi.stubGlobal("fetch", fetchFont);
  try {
    const pending = LabelAtlas.create(
      {} as GPUDevice,
      "rgba8unorm",
      {} as GPUBuffer,
      controller.signal,
    );
    const rejected = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.waitFor(() => expect(fetchFont).toHaveBeenCalledTimes(2));
    controller.abort();
    await rejected;
  } finally {
    vi.unstubAllGlobals();
  }
});

test("atlas pipeline failure releases its texture and image bitmap", async () => {
  const destroy = vi.fn(),
    close = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
      blob: async () => new Blob(),
    })),
  );
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1, height: 1, close })),
  );
  vi.stubGlobal("GPUTextureUsage", {
    TEXTURE_BINDING: 1,
    COPY_DST: 2,
    RENDER_ATTACHMENT: 4,
  });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2 });
  const device = {
    createTexture: () => ({ destroy }),
    queue: { copyExternalImageToTexture() {} },
    createShaderModule: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createRenderPipelineAsync: async () => {
      throw Error("pipeline failure");
    },
  } as unknown as GPUDevice;
  try {
    await expect(
      LabelAtlas.create(device, "rgba8unorm", {} as GPUBuffer),
    ).rejects.toThrow("pipeline failure");
    expect(destroy).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
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

test("failed label buffer growth releases partial allocations and keeps the previous pair for retry", () => {
  vi.stubGlobal("GPUBufferUsage", { VERTEX: 1, COPY_DST: 2 });
  const buffers: { destroy: ReturnType<typeof vi.fn> }[] = [];
  let calls = 0,
    failAt = 4;
  const device = {
    queue: { writeBuffer() {} },
    createBuffer() {
      if (++calls === failAt) throw Error("allocation failure");
      const buffer = { destroy: vi.fn() };
      buffers.push(buffer);
      return buffer;
    },
  } as unknown as GPUDevice;
  try {
    const layer = new LabelLayer(
      device,
      {} as GPURenderPipeline,
      {} as GPURenderPipeline,
      {} as GPUBindGroup,
      { size: 1, range: 1, glyphs: {} },
    );
    layer.update(new Map([["net", Array(16).fill(0)]]));
    expect(() => layer.update(new Map([["net", Array(2048).fill(0)]]))).toThrow(
      "allocation failure",
    );
    expect(buffers[0].destroy).not.toHaveBeenCalled();
    expect(buffers[1].destroy).not.toHaveBeenCalled();
    expect(buffers[2].destroy).toHaveBeenCalledOnce();
    failAt = -1;
    layer.update(new Map([["net", Array(2048).fill(0)]]));
    expect(buffers[0].destroy).toHaveBeenCalledOnce();
    expect(buffers[1].destroy).toHaveBeenCalledOnce();
    layer.dispose();
    expect(
      buffers.every((buffer) => buffer.destroy.mock.calls.length === 1),
    ).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});

test("a failing label buffer release does not prevent releasing other batches", () => {
  vi.stubGlobal("GPUBufferUsage", { VERTEX: 1, COPY_DST: 2 });
  let created = 0;
  const destroyed: number[] = [];
  const device = {
    queue: { writeBuffer() {} },
    createBuffer() {
      const id = ++created;
      return {
        destroy() {
          destroyed.push(id);
          if (id === 1) throw Error("release failure");
        },
      };
    },
  } as unknown as GPUDevice;
  try {
    const layer = new LabelLayer(
      device,
      {} as GPURenderPipeline,
      {} as GPURenderPipeline,
      {} as GPUBindGroup,
      { size: 1, range: 1, glyphs: {} },
    );
    layer.update(
      new Map([
        ["one", Array(16).fill(0)],
        ["two", Array(16).fill(0)],
      ]),
    );
    expect(() => layer.dispose()).toThrow(AggregateError);
    expect(destroyed).toEqual([1, 2, 3, 4]);
    expect(layer.has("one")).toBe(false);
    layer.dispose();
    expect(destroyed).toEqual([1, 2, 3, 4]);
  } finally {
    vi.unstubAllGlobals();
  }
});
