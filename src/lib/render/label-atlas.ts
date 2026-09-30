import {
  runCleanup,
  cleanupAfterFailure,
  type IDisposable,
} from "../disposable";
import type { FontAtlas } from "./font-metrics";
import { splitPositions } from "./position-precision";
import { FONT_ASSET_PATH, MsdfFont } from "../text/msdf-font";
import { prepareBoardText } from "../text/board-text-preparation";
import type { BoardScene, Bounds } from "../board/model";
import type { GpuBatch } from "./webgpu-batch-uploader";
import { cooperative } from "../cooperative";

type LabelBuffer = {
  buffer: GPUBuffer;
  residualBuffer: GPUBuffer;
  capacity: number;
  count: number;
  runs: { page: number; first: number; count: number }[];
};

export class LabelLayer implements IDisposable {
  private readonly buffers = new Map<string, LabelBuffer>();

  constructor(
    protected readonly device: GPUDevice,
    protected readonly pipeline: GPURenderPipeline,
    protected readonly clipped: GPURenderPipeline,
    private readonly bind: GPUBindGroup,
    readonly font: FontAtlas,
    private readonly pageBind?: (page: number) => GPUBindGroup,
  ) {}

  update(batches: Map<string, number[]>) {
    for (const v of this.buffers.values()) v.count = 0;
    for (const [key, data] of batches) {
      if (!data.length) continue;
      let old = this.buffers.get(key);
      const bytes = data.length * 4;
      if (!old || old.capacity < bytes) {
        const capacity = Math.ceil(bytes / 4096) * 4096;
        const buffer = this.device.createBuffer({
          size: capacity,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
        let residualBuffer: GPUBuffer;
        try {
          residualBuffer = this.device.createBuffer({
            size: capacity / 8,
            usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
          });
        } catch (error) {
          cleanupAfterFailure(error, [() => buffer.destroy()]);
        }
        const previous = old;
        old = {
          buffer,
          residualBuffer,
          capacity,
          count: 0,
          runs: [],
        };
        this.buffers.set(key, old);
        if (previous)
          runCleanup([
            () => previous.buffer.destroy(),
            () => previous.residualBuffer.destroy(),
          ]);
      }
      old.count = data.length / 16;
      old.runs = [];
      for (let i = 0; i < old.count; i++) {
        const page = Math.floor(data[i * 16 + 15] / 2);
        const previous = old.runs.at(-1);
        if (previous?.page === page) previous.count++;
        else old.runs.push({ page, first: i, count: 1 });
      }
      const split = splitPositions(data, 16, 2);
      this.device.queue.writeBuffer(old.buffer, 0, split.data);
      this.device.queue.writeBuffer(old.residualBuffer, 0, split.residual);
    }
  }

  has(key: string) {
    return !!this.buffers.get(key)?.count;
  }
  draw(pass: GPURenderPassEncoder, key: string, clip = false) {
    const b = this.buffers.get(key);
    if (!b?.count) return;
    pass.setPipeline(clip ? this.clipped : this.pipeline);
    pass.setVertexBuffer(0, b.buffer);
    pass.setVertexBuffer(1, b.residualBuffer);
    for (const run of b.runs) {
      pass.setBindGroup(0, this.pageBind?.(run.page) ?? this.bind);
      pass.draw(6, run.count, 0, run.first);
    }
  }
  clear() {
    try {
      runCleanup(
        [...this.buffers.values()].flatMap((v) => [
          () => v.buffer.destroy(),
          () => v.residualBuffer.destroy(),
        ]),
      );
    } finally {
      this.buffers.clear();
    }
  }
  dispose() {
    this.clear();
  }
}

export class LabelAtlas extends LabelLayer {
  private disposed = false;
  private readonly pages = new Map<
    number,
    { texture: GPUTexture; view: GPUTextureView }
  >();
  private readonly overlayBinds = new Map<
    GPUBuffer,
    Map<number, GPUBindGroup>
  >();
  private constructor(
    device: GPUDevice,
    pipeline: GPURenderPipeline,
    clipped: GPURenderPipeline,
    bind: GPUBindGroup,
    font: FontAtlas,
    texture: GPUTexture,
    textureView: GPUTextureView,
    private readonly sampler: GPUSampler,
    private readonly uniform: GPUBuffer,
    private readonly pageBinds: Map<number, GPUBindGroup>,
  ) {
    super(device, pipeline, clipped, bind, font, (page) => {
      const value = pageBinds.get(page);
      if (!value) throw Error("字形图集尚未加载");
      return value;
    });
    this.pages.set(0, { texture, view: textureView });
  }

  static async create(
    device: GPUDevice,
    format: GPUTextureFormat,
    uniform: GPUBuffer,
    signal?: AbortSignal,
  ): Promise<LabelAtlas> {
    signal?.throwIfAborted();
    const { labelShader } = await import("./shader-sources");
    signal?.throwIfAborted();
    const response = await fetch(
      `${import.meta.env.BASE_URL}${FONT_ASSET_PATH}core.png`,
      { signal },
    );
    if (!response.ok) throw new Error("字形图集加载失败");
    const blob = await response.blob();
    signal?.throwIfAborted();
    const bitmap = await createImageBitmap(blob, {
      colorSpaceConversion: "none",
    });
    let texture: GPUTexture | undefined;
    try {
      signal?.throwIfAborted();
      texture = device.createTexture({
        size: [bitmap.width, bitmap.height],
        format: "rgba8unorm",
        usage:
          GPUTextureUsage.TEXTURE_BINDING |
          GPUTextureUsage.COPY_DST |
          GPUTextureUsage.RENDER_ATTACHMENT,
      });
      device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
        bitmap.width,
        bitmap.height,
      ]);
      const module = device.createShaderModule({ code: labelShader });
      const layout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        ],
      });
      const descriptor: GPURenderPipelineDescriptor = {
        layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
        vertex: {
          module,
          entryPoint: "vs",
          buffers: [
            {
              arrayStride: 64,
              stepMode: "instance",
              attributes: [0, 1, 2, 3].map((i) => ({
                shaderLocation: i,
                offset: i * 16,
                format: "float32x4" as const,
              })),
            },
            {
              arrayStride: 8,
              stepMode: "instance",
              attributes: [
                { shaderLocation: 4, offset: 0, format: "float32x2" },
              ],
            },
          ],
        },
        fragment: {
          module,
          entryPoint: "fs",
          targets: [
            {
              format,
              blend: {
                color: {
                  srcFactor: "src-alpha",
                  dstFactor: "one-minus-src-alpha",
                },
                alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" },
              },
            },
          ],
        },
        primitive: { topology: "triangle-list" },
        depthStencil: {
          format: "depth24plus-stencil8",
          depthWriteEnabled: false,
          depthCompare: "always",
        },
      };
      const pipeline = await device.createRenderPipelineAsync(descriptor);
      const clipped = await device.createRenderPipelineAsync({
        ...descriptor,
        depthStencil: {
          ...descriptor.depthStencil!,
          stencilFront: { compare: "equal" },
          stencilBack: { compare: "equal" },
          stencilWriteMask: 0,
        },
      });
      signal?.throwIfAborted();
      const textureView = texture.createView(),
        sampler = device.createSampler({
          magFilter: "linear",
          minFilter: "linear",
        });
      const bind = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniform } },
          { binding: 1, resource: textureView },
          { binding: 2, resource: sampler },
        ],
      });
      return new LabelAtlas(
        device,
        pipeline,
        clipped,
        bind,
        MsdfFont.font,
        texture,
        textureView,
        sampler,
        uniform,
        new Map([[0, bind]]),
      );
    } catch (error) {
      texture?.destroy();
      throw error;
    } finally {
      bitmap.close();
    }
  }

  /** Upload only pages used by board text or automatic labels, once per device.
   * A cancelled/failed upload never leaves a published texture or bind group. */
  async prepare(scene: BoardScene, signal?: AbortSignal) {
    signal?.throwIfAborted();
    await prepareBoardText(scene, signal);
    const needed = new Set<number>();
    const checkpoint = cooperative(signal);
    let work = 0;
    for (const texts of [
      scene.texts,
      (function* () {
        for (const text of scene.nets.values()) yield { text };
      })(),
    ])
      for (const { text } of texts)
        for (const ch of text) {
          needed.add(MsdfFont.glyph(ch)?.page ?? 0);
          if ((++work & 4095) === 0) {
            const pause = checkpoint();
            if (pause) await pause;
          }
        }
    for (const page of needed) {
      signal?.throwIfAborted();
      if (this.disposed) throw Error("Font atlas disposed");
      if (this.pages.has(page)) continue;
      const block = (page - 1).toString(16).padStart(2, "0");
      const response = await fetch(
        `${import.meta.env.BASE_URL}${FONT_ASSET_PATH}${block}.png`,
        { signal },
      );
      if (!response.ok) throw Error("字形图集加载失败");
      const bitmap = await createImageBitmap(await response.blob(), {
        colorSpaceConversion: "none",
      });
      let texture: GPUTexture | undefined;
      try {
        signal?.throwIfAborted();
        if (this.disposed) throw Error("Font atlas disposed");
        texture = this.device.createTexture({
          size: [bitmap.width, bitmap.height],
          format: "rgba8unorm",
          usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.device.queue.copyExternalImageToTexture(
          { source: bitmap },
          { texture },
          [bitmap.width, bitmap.height],
        );
        const view = texture.createView();
        const bind = this.bindView(view, this.uniform);
        this.pages.set(page, { texture, view });
        this.pageBinds.set(page, bind);
      } catch (error) {
        texture?.destroy();
        throw error;
      } finally {
        bitmap.close();
      }
    }
  }

  private bindView(view: GPUTextureView, uniform: GPUBuffer) {
    return this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: view },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  drawBatch(
    pass: GPURenderPassEncoder,
    batch: GpuBatch,
    view: Bounds,
    uniform?: GPUBuffer,
  ) {
    let bind = this.pageBinds.get(batch.msdf!);
    if (!bind) throw Error("字形图集尚未加载");
    if (uniform) {
      let binds = this.overlayBinds.get(uniform);
      if (!binds) this.overlayBinds.set(uniform, (binds = new Map()));
      let overlay = binds.get(batch.msdf!);
      if (!overlay) {
        overlay = this.bindView(this.pages.get(batch.msdf!)!.view, uniform);
        binds.set(batch.msdf!, overlay);
      }
      bind = overlay;
    }
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bind);
    pass.setVertexBuffer(0, batch.buffer);
    pass.setVertexBuffer(1, batch.residualBuffer);
    if (batch.spatialIndex)
      batch.spatialIndex.visible(view, (first, count) =>
        pass.draw(6, count, 0, first),
      );
    else pass.draw(6, batch.count);
  }

  // Independent screen-space text reuses the atlas and pipelines, while owning
  // its own batches and camera. It must be cleared before the atlas is disposed.
  createLayer(uniform: GPUBuffer): LabelLayer {
    const binds = new Map<number, GPUBindGroup>();
    const bindPage = (page: number) => {
      let bind = binds.get(page);
      if (!bind) {
        const value = this.pages.get(page);
        if (!value) throw Error("字形图集尚未加载");
        bind = this.bindView(value.view, uniform);
        binds.set(page, bind);
      }
      return bind;
    };
    return new LabelLayer(
      this.device,
      this.pipeline,
      this.clipped,
      bindPage(0),
      this.font,
      bindPage,
    );
  }

  override dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      runCleanup([
        () => super.dispose(),
        ...[...this.pages.values()].map((page) => () => page.texture.destroy()),
      ]);
    } finally {
      this.pages.clear();
      this.pageBinds.clear();
      this.overlayBinds.clear();
    }
  }
}
