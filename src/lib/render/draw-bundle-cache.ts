import type { IDisposable } from "../disposable";
import type { GpuBatch } from "./webgpu-batch-uploader";

type Entry = {
  pipeline: GPURenderPipeline;
  bind: GPUBindGroup;
  ranges: number[];
  bundle?: GPURenderBundle;
  unsubscribe: () => void;
};

/** Only ordinary, immutable geometry. Copper's dynamic stencil references and
 * labels stay on the direct path. A changed range is drawn directly first;
 * recording starts only when the same commands are requested again. */
export class DrawBundleCache implements IDisposable {
  private readonly entries = new Map<GpuBatch, Entry>();

  constructor(
    private readonly device: GPUDevice,
    private readonly format: GPUTextureFormat,
  ) {}

  draw(
    pass: GPURenderPassEncoder,
    batch: GpuBatch,
    pipeline: GPURenderPipeline,
    bind: GPUBindGroup,
    ranges: number[],
    cache = true,
  ) {
    if (!batch.owner.alive) return;
    const encode = (target: GPURenderPassEncoder | GPURenderBundleEncoder) => {
      target.setPipeline(pipeline);
      target.setBindGroup(0, bind);
      target.setVertexBuffer(0, batch.buffer);
      target.setVertexBuffer(1, batch.residualBuffer);
      if (batch.colorBuffer) target.setVertexBuffer(2, batch.colorBuffer);
      if (batch.indexBuffer) target.setIndexBuffer(batch.indexBuffer, "uint32");
      for (let i = 0; i < ranges.length; i += 2) {
        const first = ranges[i],
          count = ranges[i + 1];
        if (batch.indexBuffer) target.drawIndexed(count, 1, first);
        else if (batch.triangles) target.draw(count, 1, first);
        else target.draw(4, count, 0, first);
      }
    };
    let entry = this.entries.get(batch);
    const same =
      entry &&
      entry.pipeline === pipeline &&
      entry.bind === bind &&
      entry.ranges.length === ranges.length &&
      ranges.every((value, i) => value === entry!.ranges[i]);
    // Four or fewer commands do not justify retaining a bundle.
    if (!cache || ranges.length <= 8) {
      this.remove(batch);
      encode(pass);
    } else if (same) {
      if (!entry!.bundle) {
        const encoder = this.device.createRenderBundleEncoder({
          colorFormats: [this.format],
          depthStencilFormat: "depth24plus-stencil8",
          sampleCount: 1,
        });
        encode(encoder);
        entry!.bundle = encoder.finish();
      }
      pass.executeBundles([entry!.bundle!]);
    } else {
      this.remove(batch);
      entry = { pipeline, bind, ranges, unsubscribe: () => {} };
      entry.unsubscribe = batch.owner.onDispose(() => this.remove(batch));
      this.entries.set(batch, entry);
      encode(pass);
    }
  }

  private remove(batch: GpuBatch) {
    this.entries.get(batch)?.unsubscribe();
    this.entries.delete(batch);
  }

  dispose() {
    for (const batch of this.entries.keys()) this.remove(batch);
  }
}
