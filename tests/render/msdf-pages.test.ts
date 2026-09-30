import { expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import type { BoardScene } from "../../src/lib/board/model";
import { LabelAtlas, LabelLayer } from "../../src/lib/render/label-atlas";
import { MsdfFont } from "../../src/lib/text/msdf-font";

test("mixed atlas pages keep label order and the independent-opacity flag", () => {
  vi.stubGlobal("GPUBufferUsage", { VERTEX: 1, COPY_DST: 2 });
  const bindPage = vi.fn(
    (page: number) => ({ page }) as unknown as GPUBindGroup,
  );
  const layer = new LabelLayer(
    {
      createBuffer: () => ({ destroy() {} }),
      queue: { writeBuffer() {} },
    } as unknown as GPUDevice,
    {} as GPURenderPipeline,
    {} as GPURenderPipeline,
    {} as GPUBindGroup,
    MsdfFont.font,
    bindPage,
  );
  try {
    const values = [0, 158, 1].flatMap((flags) => [
      0,
      0,
      1,
      1,
      0,
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      flags,
    ]);
    layer.update(new Map([["mixed", values]]));
    const pass = {
      setPipeline() {},
      setBindGroup() {},
      setVertexBuffer() {},
      draw: vi.fn(),
    };
    layer.draw(pass as unknown as GPURenderPassEncoder, "mixed");
    expect(bindPage.mock.calls).toEqual([[0], [79], [0]]);
    expect(pass.draw.mock.calls).toEqual([
      [6, 1, 0, 0],
      [6, 1, 0, 1],
      [6, 1, 0, 2],
    ]);
  } finally {
    layer.dispose();
    vi.unstubAllGlobals();
  }
});

test("GPU pages load on demand, reuse textures, release cancelled uploads and retry", async () => {
  const textures: {
    destroy: ReturnType<typeof vi.fn>;
    createView: () => object;
  }[] = [];
  const close = vi.fn(),
    requests: string[] = [];
  let onDecode: (() => void) | undefined;
  vi.stubGlobal("GPUTextureUsage", {
    TEXTURE_BINDING: 1,
    COPY_DST: 2,
    RENDER_ATTACHMENT: 4,
  });
  vi.stubGlobal("GPUShaderStage", { VERTEX: 1, FRAGMENT: 2 });
  vi.stubGlobal("createImageBitmap", async () => {
    onDecode?.();
    return { width: 1024, height: 1024, close };
  });
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    requests.push(url);
    init?.signal?.throwIfAborted();
    const name = url.split("/").at(-1)!;
    return {
      ok: true,
      blob: async () => new Blob(),
      json: async () =>
        JSON.parse(
          await readFile(
            new URL(
              `../../public/fonts/source-han-sans/${name}`,
              import.meta.url,
            ),
            "utf8",
          ),
        ),
    };
  });
  const device = {
    createTexture: () => {
      const value = { destroy: vi.fn(), createView: () => ({}) };
      textures.push(value);
      return value;
    },
    queue: { copyExternalImageToTexture() {} },
    createShaderModule: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createBindGroup: () => ({}),
    createSampler: () => ({}),
    createRenderPipelineAsync: async () => ({ getBindGroupLayout: () => ({}) }),
  } as unknown as GPUDevice;
  const scene = (value: string) =>
    ({
      texts: [{ text: value }],
      nets: new Map(),
      diagnostics: [],
    }) as unknown as BoardScene;
  try {
    const atlas = await LabelAtlas.create(
      device,
      "rgba8unorm",
      {} as GPUBuffer,
    );
    await atlas.prepare(scene("ENGLISH 123 Ωµ°"));
    expect(requests).toHaveLength(1);
    expect(textures).toHaveLength(1);
    const chinese = scene("中");
    const cancelled = new AbortController();
    onDecode = () => cancelled.abort();
    await expect(
      atlas.prepare(chinese, cancelled.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(textures).toHaveLength(1);
    expect(close).toHaveBeenCalledTimes(2);
    onDecode = undefined;
    await atlas.prepare(chinese);
    expect(textures).toHaveLength(2);
    const count = requests.length;
    await atlas.prepare(chinese);
    expect(requests).toHaveLength(count);
    const pass = {
      setPipeline: vi.fn(),
      setBindGroup: vi.fn(),
      setVertexBuffer: vi.fn(),
      draw: vi.fn(),
    };
    atlas.drawBatch(
      pass as unknown as GPURenderPassEncoder,
      {
        msdf: MsdfFont.glyph("中")!.page,
        buffer: {},
        residualBuffer: {},
        count: 3,
      } as never,
      { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    );
    expect(pass.draw).toHaveBeenCalledWith(6, 3);
    atlas.dispose();
    atlas.dispose();
    expect(textures.every((t) => t.destroy.mock.calls.length === 1)).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
