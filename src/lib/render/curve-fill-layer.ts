import type { Bounds, Point, Zone } from "../board/model";
import { ZoneShape } from "../board/shapes/zone";

import type { IDisposable } from "../disposable";
import { CurveTessellator } from "./curve-tessellator";
import { PositionPrecision } from "./position-precision";

const contains = (a: Bounds, b: Bounds) =>
  a.minX <= b.minX && a.maxX >= b.maxX && a.minY <= b.minY && a.maxY >= b.maxY;

/** Deep-view meshes only. Each contour toggles scratch bit 2 independently;
 * its coverage sets (exterior) or clears (holes) final bit 1. Overlapping and
 * nested holes therefore remain a union. Fill, text and selection share bit 1. */
type Entry = {
  data: GPUBuffer;
  low: GPUBuffer;
  bytes: number;
  view: Bounds;
  tolerance: number;
  ranges: { start: number; count: number; outer: boolean }[];
};

export class CurveFillLayer implements IDisposable {
  private readonly entries = new Map<Zone, Entry>();
  private readonly curved = new WeakMap<Zone, boolean>();
  private bytes = 0;

  private constructor(
    private readonly device: GPUDevice,
    private readonly toggle: GPURenderPipeline,
    private readonly apply: GPURenderPipeline,
    private readonly clearScratch: GPURenderPipeline,
    private readonly clearAll: GPURenderPipeline,
    private readonly cover: GPURenderPipeline,
  ) {}

  static async create(
    device: GPUDevice,
    descriptor: GPURenderPipelineDescriptor,
  ): Promise<CurveFillLayer> {
    const stencil = (
      face: GPUStencilFaceState,
      read: number,
      write: number,
    ): GPUDepthStencilState => ({
      format: "depth24plus-stencil8",
      depthWriteEnabled: false,
      depthCompare: "always",
      stencilFront: face,
      stencilBack: face,
      stencilReadMask: read,
      stencilWriteMask: write,
    });
    const mask = {
      ...descriptor,
      fragment: {
        ...descriptor.fragment!,
        targets: [
          {
            format: Array.from(descriptor.fragment!.targets)[0]!.format,
            writeMask: 0,
          },
        ],
      },
    };
    const [toggle, apply, clearScratch, clearAll, cover] = await Promise.all([
      device.createRenderPipelineAsync({
        ...mask,
        depthStencil: stencil({ compare: "always", passOp: "invert" }, 2, 2),
      }),
      device.createRenderPipelineAsync({
        ...mask,
        depthStencil: stencil({ compare: "equal", passOp: "replace" }, 2, 1),
      }),
      device.createRenderPipelineAsync({
        ...mask,
        depthStencil: stencil({ compare: "always", passOp: "zero" }, 2, 2),
      }),
      device.createRenderPipelineAsync({
        ...mask,
        depthStencil: stencil({ compare: "always", passOp: "zero" }, 3, 3),
      }),
      device.createRenderPipelineAsync({
        ...descriptor,
        depthStencil: stencil({ compare: "equal" }, 3, 0),
      }),
    ]);
    return new CurveFillLayer(
      device,
      toggle,
      apply,
      clearScratch,
      clearAll,
      cover,
    );
  }

  private destroy(entry: Entry) {
    entry.data.destroy();
    entry.low.destroy();
    this.bytes -= entry.bytes;
  }
  clear() {
    for (const entry of this.entries.values()) this.destroy(entry);
    this.entries.clear();
  }
  dispose() {
    this.clear();
  }

  private buffer(values: Float32Array) {
    const result = this.device.createBuffer({
      size: Math.max(4, values.byteLength),
      usage: GPUBufferUsage.VERTEX,
      mappedAtCreation: true,
    });
    new Float32Array(result.getMappedRange()).set(values);
    result.unmap();
    return result;
  }

  /** Normal zoom keeps the existing cached static batches. */
  eligible(zone: Zone, scale: number, dpr: number) {
    if (scale * dpr <= 1000 || !zone.paths.length) return false;
    let value = zone.curved ?? this.curved.get(zone);
    if (value === undefined) {
      value = zone.paths.some((path) => path.some((edge) => !!edge.arc));
      this.curved.set(zone, value);
    }
    return value;
  }
  draw(
    pass: GPURenderPassEncoder,
    zone: Zone,
    view: Bounds,
    origin: Point,
    scale: number,
    dpr: number,
    color: GPUBuffer,
    bind: GPUBindGroup,
    fill: GPUBindGroup,
    labels?: () => void,
  ) {
    const { toggle, apply, clearScratch, clearAll, cover } = this;
    // Quarter physical pixel, rounded toward finer detail. Overscan allows
    // panning without rebuilding; higher detail is retained on zoom-out.
    const tolerance = 0.25 / 2 ** Math.ceil(Math.log2(scale * dpr));
    let entry = this.entries.get(zone);
    if (!entry || entry.tolerance > tolerance || !contains(entry.view, view)) {
      if (entry) {
        this.destroy(entry);
        this.entries.delete(zone);
      }
      const dx = (view.maxX - view.minX) / 2,
        dy = (view.maxY - view.minY) / 2;
      const cachedView = {
        minX: view.minX - dx,
        maxX: view.maxX + dx,
        minY: view.minY - dy,
        maxY: view.maxY + dy,
      };
      const vertices: number[] = [],
        ranges: Entry["ranges"] = [];
      const vertex = (p: Point) =>
        vertices.push(p[0] - origin[0], p[1] - origin[1]);
      const { minX: x0, maxX: x1, minY: y0, maxY: y1 } = cachedView;
      // First six vertices cover the complete cached viewport.
      for (const p of [
        [x0, y0],
        [x1, y0],
        [x0, y1],
        [x0, y1],
        [x1, y0],
        [x1, y1],
      ] as Point[])
        vertex(p);
      for (const i of [0, ...new ZoneShape(zone).holeCandidates(cachedView)]) {
        const ring = CurveTessellator.ring(
            zone.paths[i],
            cachedView,
            tolerance,
          ),
          start = vertices.length / 2;
        for (let j = 1; j + 1 < ring.length; j++) {
          vertex(ring[0]);
          vertex(ring[j]);
          vertex(ring[j + 1]);
        }
        if (vertices.length / 2 > start)
          ranges.push({
            start,
            count: vertices.length / 2 - start,
            outer: i === 0,
          });
      }
      const split = PositionPrecision.split(vertices, 2, 2),
        data = this.buffer(split.data);
      let low: GPUBuffer;
      try {
        low = this.buffer(split.residual);
      } catch (error) {
        data.destroy();
        throw error;
      }
      entry = {
        data,
        low,
        bytes: data.size + low.size,
        ranges,
        view: cachedView,
        tolerance,
      };
      this.bytes += entry.bytes;
    }
    // Insertion order is LRU. No eviction during encoding: an earlier draw
    // in this same command buffer may still reference an entry.
    this.entries.delete(zone);
    this.entries.set(zone, entry);
    pass.setVertexBuffer(0, entry.data);
    pass.setVertexBuffer(1, entry.low);
    pass.setVertexBuffer(2, color);
    pass.setBindGroup(0, bind);
    for (const range of entry.ranges) {
      pass.setPipeline(toggle);
      pass.draw(range.count, 1, range.start);
      pass.setPipeline(apply);
      pass.setStencilReference(range.outer ? 3 : 2);
      pass.draw(6);
      pass.setPipeline(clearScratch);
      pass.draw(6);
    }
    pass.setStencilReference(1);
    pass.setPipeline(cover);
    pass.setBindGroup(0, fill);
    pass.draw(6);
    labels?.();
    // Text changes vertex buffers and pipeline; restore before clearing.
    pass.setVertexBuffer(0, entry.data);
    pass.setVertexBuffer(1, entry.low);
    pass.setVertexBuffer(2, color);
    pass.setBindGroup(0, bind);
    pass.setPipeline(clearAll);
    pass.draw(6);
  }
  /** Called only after submitting the frame, so eviction cannot invalidate
   * buffers referenced by an unfinished command encoder. */
  finishFrame() {
    for (const [zone, entry] of this.entries) {
      if (this.bytes <= 64 * 1024 * 1024) break;
      this.destroy(entry);
      this.entries.delete(zone);
    }
  }
}
