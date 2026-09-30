/// <reference types="@webgpu/types" />
import type { Selection } from "../interaction/picking";
import type { SelectionTaskState } from "./renderer";
import { CurveFillLayer } from "./curve-fill-layer";
import { LabelAtlas } from "./label-atlas";
import { arcVertexBuffers } from "./arc-batch-builder";
import {
  Disposables,
  cleanupAfterFailure,
  type IDisposable,
} from "../disposable";
import { STROKE_PACKET, TRIANGLE_PACKET } from "./primitive-layout";

interface ResourceFields {
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  onError: (message: string) => void;
  onSelection?: (selection: Selection | null) => void;
  onSelectionTask?: (state: SelectionTaskState | null) => void;
  device: GPUDevice;
  context: GPUCanvasContext;
  pipeline: GPURenderPipeline;
  polygonPipeline: GPURenderPipeline;
  arcPipeline: GPURenderPipeline;
  solidCopperPipeline: GPURenderPipeline;
  copperPipeline: GPURenderPipeline;
  maskPipeline: GPURenderPipeline;
  curveFills: CurveFillLayer;
  labels: LabelAtlas;
  uniform: GPUBuffer;
  zoneUniform: GPUBuffer;
  selectionUniform: GPUBuffer;
  hoverUniform: GPUBuffer;
  bind: GPUBindGroup;
  zoneBind: GPUBindGroup;
  zoneOutlineBind: GPUBindGroup;
  polygonBind: GPUBindGroup;
  selectionBind: GPUBindGroup;
  hoverBind: GPUBindGroup;
  selectionPolygonBind: GPUBindGroup;
  hoverPolygonBind: GPUBindGroup;
}

export class WebGPUResources implements IDisposable {
  readonly format!: ResourceFields["format"];
  readonly canvas!: ResourceFields["canvas"];
  readonly onError!: ResourceFields["onError"];
  readonly onSelection!: ResourceFields["onSelection"];
  readonly onSelectionTask!: ResourceFields["onSelectionTask"];
  readonly device!: ResourceFields["device"];
  readonly context!: ResourceFields["context"];
  readonly pipeline!: ResourceFields["pipeline"];
  readonly polygonPipeline!: ResourceFields["polygonPipeline"];
  readonly arcPipeline!: ResourceFields["arcPipeline"];
  readonly solidCopperPipeline!: ResourceFields["solidCopperPipeline"];
  readonly copperPipeline!: ResourceFields["copperPipeline"];
  readonly maskPipeline!: ResourceFields["maskPipeline"];
  readonly curveFills!: ResourceFields["curveFills"];
  readonly labels!: ResourceFields["labels"];
  readonly uniform!: ResourceFields["uniform"];
  readonly zoneUniform!: ResourceFields["zoneUniform"];
  readonly selectionUniform!: ResourceFields["selectionUniform"];
  readonly hoverUniform!: ResourceFields["hoverUniform"];
  readonly bind!: ResourceFields["bind"];
  readonly zoneBind!: ResourceFields["zoneBind"];
  readonly zoneOutlineBind!: ResourceFields["zoneOutlineBind"];
  readonly polygonBind!: ResourceFields["polygonBind"];
  readonly selectionBind!: ResourceFields["selectionBind"];
  readonly hoverBind!: ResourceFields["hoverBind"];
  readonly selectionPolygonBind!: ResourceFields["selectionPolygonBind"];
  readonly hoverPolygonBind!: ResourceFields["hoverPolygonBind"];
  private readonly disposables = new Disposables();
  private disposed = false;

  private constructor(fields: ResourceFields) {
    Object.assign(this, fields);
    this.disposables.add(this.labels);
    this.disposables.add(this.curveFills);
    for (const buffer of [
      this.uniform,
      this.zoneUniform,
      this.selectionUniform,
      this.hoverUniform,
    ])
      this.disposables.add({ dispose: () => buffer.destroy() });
    this.disposables.add({ dispose: () => this.context.unconfigure() });
    this.disposables.add({ dispose: () => this.device.destroy() });
  }

  static async create(
    canvas: HTMLCanvasElement,
    onError: (message: string) => void,
    signal?: AbortSignal,
    onSelection?: (selection: Selection | null) => void,
    onSelectionTask?: (state: SelectionTaskState | null) => void,
  ): Promise<WebGPUResources> {
    if (!navigator.gpu)
      throw new Error("此浏览器未提供 WebGPU，请开启硬件加速。");
    const { primitiveShader, polygonShader, arcShader } =
      await import("./shader-sources");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("未找到 WebGPU 图形设备");
    const device = await adapter.requestDevice(),
      context = canvas.getContext("webgpu");
    if (!context) {
      device.destroy();
      throw new Error("无法初始化 WebGPU 画布");
    }
    const pending: IDisposable[] = [];
    let configured = false;
    try {
      const format = navigator.gpu.getPreferredCanvasFormat();
      const shader = device.createShaderModule({ code: primitiveShader });
      const compilation = await shader.getCompilationInfo();
      const errors = compilation.messages.filter((m) => m.type === "error");
      if (errors.length) {
        throw new Error(
          errors
            .map((m) => `${m.lineNum}:${m.linePos} ${m.message}`)
            .join("\n"),
        );
      }
      const pipeline = await device.createRenderPipelineAsync({
        layout: "auto",
        vertex: {
          module: shader,
          entryPoint: "vs",
          buffers: [
            {
              arrayStride:
                STROKE_PACKET.stride * Float32Array.BYTES_PER_ELEMENT,
              stepMode: "instance",
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x4" },
                { shaderLocation: 1, offset: 16, format: "float32x4" },
                { shaderLocation: 2, offset: 32, format: "float32x4" },
              ],
            },
            {
              arrayStride:
                STROKE_PACKET.positions * Float32Array.BYTES_PER_ELEMENT,
              stepMode: "instance",
              attributes: [
                { shaderLocation: 3, offset: 0, format: "float32x4" },
              ],
            },
          ],
        },
        fragment: {
          module: shader,
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
        primitive: { topology: "triangle-strip" },
        depthStencil: {
          format: "depth24plus-stencil8",
          depthWriteEnabled: false,
          depthCompare: "always",
        },
      });
      if (signal?.aborted) {
        signal.throwIfAborted();
      }
      const polygonModule = device.createShaderModule({ code: polygonShader });
      const polygonGroupLayout = device.createBindGroupLayout({
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" },
          },
        ],
      });
      const polygonLayout = device.createPipelineLayout({
        bindGroupLayouts: [polygonGroupLayout],
      });
      const polygonDescriptor: GPURenderPipelineDescriptor = {
        layout: polygonLayout,
        vertex: {
          module: polygonModule,
          entryPoint: "vs",
          buffers: [
            {
              arrayStride:
                TRIANGLE_PACKET.stride * Float32Array.BYTES_PER_ELEMENT,
              attributes: [
                { shaderLocation: 0, offset: 0, format: "float32x2" },
                { shaderLocation: 1, offset: 8, format: "float32x4" },
              ],
            },
            {
              arrayStride:
                TRIANGLE_PACKET.positions * Float32Array.BYTES_PER_ELEMENT,
              attributes: [
                { shaderLocation: 2, offset: 0, format: "float32x2" },
              ],
            },
          ],
        },
        fragment: {
          module: polygonModule,
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
      const polygonPipeline =
        await device.createRenderPipelineAsync(polygonDescriptor);
      const arcModule = device.createShaderModule({ code: arcShader });
      const arcPipeline = await device.createRenderPipelineAsync({
        ...polygonDescriptor,
        primitive: { topology: "triangle-strip" },
        vertex: {
          module: arcModule,
          entryPoint: "vs",
          buffers: arcVertexBuffers,
        },
        fragment: { ...polygonDescriptor.fragment!, module: arcModule },
      });
      const copperBuffers: GPUVertexBufferLayout[] = [
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }],
        },
        {
          arrayStride: 8,
          attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }],
        },
        {
          arrayStride: 16,
          stepMode: "instance",
          attributes: [{ shaderLocation: 1, offset: 0, format: "float32x4" }],
        },
      ];
      const copperDescriptor: GPURenderPipelineDescriptor = {
        ...polygonDescriptor,
        vertex: { ...polygonDescriptor.vertex, buffers: copperBuffers },
      };
      const curveFills = await CurveFillLayer.create(device, copperDescriptor);
      pending.push(curveFills);
      const solidCopperPipeline =
        await device.createRenderPipelineAsync(copperDescriptor);
      const copperPipeline = await device.createRenderPipelineAsync({
        ...copperDescriptor,
        depthStencil: {
          ...polygonDescriptor.depthStencil!,
          stencilFront: { compare: "equal" },
          stencilBack: { compare: "equal" },
          stencilWriteMask: 0,
        },
      });
      if (signal?.aborted) {
        signal.throwIfAborted();
      }
      const uniform = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      pending.push({ dispose: () => uniform.destroy() });
      const bind = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniform } }],
      });
      const zoneUniform = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      pending.push({ dispose: () => zoneUniform.destroy() });
      const zoneBind = device.createBindGroup({
        layout: polygonPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: zoneUniform } }],
      });
      const zoneOutlineBind = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: zoneUniform } }],
      });
      const polygonBind = device.createBindGroup({
        layout: polygonPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: uniform } }],
      });
      const selectionUniform = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      pending.push({ dispose: () => selectionUniform.destroy() });
      const hoverUniform = device.createBuffer({
        size: 64,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      pending.push({ dispose: () => hoverUniform.destroy() });
      const selectionBind = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: selectionUniform } }],
      });
      const hoverBind = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: hoverUniform } }],
      });
      const selectionPolygonBind = device.createBindGroup({
        layout: polygonPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: selectionUniform } }],
      });
      const hoverPolygonBind = device.createBindGroup({
        layout: polygonPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: hoverUniform } }],
      });
      const labels = await LabelAtlas.create(device, format, uniform, signal);
      pending.push(labels);
      const maskPipeline = await device.createRenderPipelineAsync({
        ...copperDescriptor,
        fragment: {
          module: polygonModule,
          entryPoint: "fs",
          targets: [{ format, writeMask: 0 }],
        },
        depthStencil: {
          format: "depth24plus-stencil8",
          depthWriteEnabled: false,
          depthCompare: "always",
          stencilFront: { compare: "always", passOp: "replace" },
          stencilBack: { compare: "always", passOp: "replace" },
        },
      });
      if (signal?.aborted) {
        signal.throwIfAborted();
      }
      context.configure({ device, format, alphaMode: "opaque" });
      configured = true;
      return new WebGPUResources({
        format,
        canvas,
        onError,
        onSelection,
        onSelectionTask,
        device,
        context,
        pipeline,
        polygonPipeline,
        arcPipeline,
        solidCopperPipeline,
        copperPipeline,
        maskPipeline,
        curveFills,
        labels,
        uniform,
        zoneUniform,
        selectionUniform,
        hoverUniform,
        bind,
        zoneBind,
        zoneOutlineBind,
        polygonBind,
        selectionBind,
        hoverBind,
        selectionPolygonBind,
        hoverPolygonBind,
      });
    } catch (error) {
      cleanupAfterFailure(error, [
        ...pending.reverse().map((item) => () => item.dispose()),
        () => {
          if (configured) context.unconfigure();
        },
        () => device.destroy(),
      ]);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.disposables.dispose();
  }
}
