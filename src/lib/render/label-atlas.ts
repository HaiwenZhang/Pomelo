import {
  runCleanup,
  cleanupAfterFailure,
  type IDisposable,
} from "../disposable";
import type { FontAtlas } from "./font-metrics";
import { FontMetrics } from "./font-metrics";
import { splitPositions } from "./position-precision";

type LabelBuffer = {
  buffer: GPUBuffer;
  residualBuffer: GPUBuffer;
  capacity: number;
  count: number;
};

export class LabelLayer implements IDisposable {
  private readonly buffers = new Map<string, LabelBuffer>();

  constructor(
    protected readonly device: GPUDevice,
    protected readonly pipeline: GPURenderPipeline,
    protected readonly clipped: GPURenderPipeline,
    private readonly bind: GPUBindGroup,
    readonly font: FontAtlas,
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
        };
        this.buffers.set(key, old);
        if (previous)
          runCleanup([
            () => previous.buffer.destroy(),
            () => previous.residualBuffer.destroy(),
          ]);
      }
      old.count = data.length / 16;
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
    pass.setBindGroup(0, this.bind);
    pass.setVertexBuffer(0, b.buffer);
    pass.setVertexBuffer(1, b.residualBuffer);
    pass.draw(6, b.count);
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
  private constructor(
    device: GPUDevice,
    pipeline: GPURenderPipeline,
    clipped: GPURenderPipeline,
    bind: GPUBindGroup,
    font: FontAtlas,
    private readonly texture: GPUTexture,
    private readonly textureView: GPUTextureView,
    private readonly sampler: GPUSampler,
  ) {
    super(device, pipeline, clipped, bind, font);
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
    const [metadata, blob] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}fonts/NotoSansSC-SemiBold.json`, {
        signal,
      }).then((r) => {
        if (!r.ok) throw new Error("字体度量加载失败");
        return r.json();
      }),
      fetch(`${import.meta.env.BASE_URL}fonts/NotoSansSC-SemiBold-msdf.png`, {
        signal,
      }).then((r) => {
        if (!r.ok) throw new Error("字形图集加载失败");
        return r.blob();
      }),
    ]);
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
        FontMetrics.fromMsdf(metadata),
        texture,
        textureView,
        sampler,
      );
    } catch (error) {
      texture?.destroy();
      throw error;
    } finally {
      bitmap.close();
    }
  }

  // Independent screen-space text reuses the atlas and pipelines, while owning
  // its own batches and camera. It must be cleared before the atlas is disposed.
  createLayer(uniform: GPUBuffer): LabelLayer {
    const bind = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: this.textureView },
        { binding: 2, resource: this.sampler },
      ],
    });
    return new LabelLayer(
      this.device,
      this.pipeline,
      this.clipped,
      bind,
      this.font,
    );
  }

  override dispose() {
    if (this.disposed) return;
    this.disposed = true;
    runCleanup([() => super.dispose(), () => this.texture.destroy()]);
  }
}
