import { runCleanup, type IDisposable } from "../disposable";
import type { GpuBatch } from "./webgpu-batch-uploader";
import { GpuGeometry } from "./gpu-geometry";

/** A preparation result owns only its new allocations. Shared range views do not
 * acquire ownership; disposing an overlay cannot destroy its source scene. */
export class GpuBatchSet implements IDisposable {
  readonly batches: GpuBatch[] = [];
  private readonly owners = new Set<GpuGeometry>();
  private disposed = false;
  own(owner: GpuGeometry) {
    if (this.disposed) {
      owner.dispose();
      throw new Error("GPU batch set disposed");
    }
    this.owners.add(owner);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      runCleanup(
        [...this.owners].map((owner) => () => owner.dispose()),
        "GPU batch disposal failed",
      );
    } finally {
      this.owners.clear();
      this.batches.length = 0;
    }
  }
}
