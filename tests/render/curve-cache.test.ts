import { expect, test, vi } from "vitest";
import { CurveFillLayer } from "../../src/lib/render/curve-fill-layer";
import type { Zone } from "../../src/lib/board/model";

test("visible working sets survive the budget; offscreen entries evict after submission", async () => {
  vi.stubGlobal("GPUBufferUsage", { VERTEX: 32 });
  const buffers: { destroy: ReturnType<typeof vi.fn> }[] = [];
  const createBuffer = vi.fn(({ size }: { size: number }) => {
    const buffer = {
      size: 20 * 1024 * 1024,
      getMappedRange: () => new ArrayBuffer(size),
      unmap: vi.fn(),
      destroy: vi.fn(),
    };
    buffers.push(buffer);
    return buffer;
  });
  try {
    const layer = await CurveFillLayer.create(
      {
        createBuffer,
        createRenderPipelineAsync: async () => ({}),
      } as unknown as GPUDevice,
      {
        fragment: { targets: [{ format: "bgra8unorm" }] },
      } as GPURenderPipelineDescriptor,
    );
    const zone = (id: number): Zone =>
      ({ id, paths: [[]], rings: [], layer: 0, net: 0 }) as unknown as Zone;
    const first = zone(1),
      second = zone(2),
      view = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    // Empty paths are sufficient for the cache/ownership test; curve shape
    // and union semantics are exercised by curve-fill.test.ts and GPU images.
    layer.beginFrame();
    layer.prepare(first, view, [0, 0], 2000, 1);
    layer.prepare(second, view, [0, 0], 2000, 1);
    layer.finishFrame();
    expect(layer.stats.overBudgetBytes).toBe(16 * 1024 * 1024);
    expect(buffers.every((b) => !b.destroy.mock.calls.length)).toBe(true);
    layer.beginFrame();
    layer.prepare(first, view, [0, 0], 2000, 1);
    layer.finishFrame();
    expect(layer.stats.hits).toBe(1);
    expect(layer.stats.evictions).toBe(1);
    expect(layer.stats.overBudgetBytes).toBe(0);
    expect(createBuffer).toHaveBeenCalledTimes(4);
    layer.dispose();
    expect(buffers.every((b) => b.destroy.mock.calls.length === 1)).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
