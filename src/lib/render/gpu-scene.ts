import type { BoardScene } from "../board/model";
import { BoardDisplay, type DisplayOptions } from "../board/display";
import type { BoardIndex } from "../interaction/picking";
import type { ViaLabelIndex } from "./via-label-index";
import type { TrackLabelIndex } from "./track-label-index";
import type { AreaLabelIndex } from "./area-label-index";
import type { GpuBatchSet } from "./gpu-batch-set";
import type { WebGPUBatchUploader } from "./webgpu-batch-uploader";

/** The lifetime boundary for a prepared board. Overlays keep range views;
 * all base geometry allocations and their spatial identities belong here. */
export class GpuScene {
  readonly zoneById;
  batches;
  private disposed = false;
  constructor(
    readonly source: BoardScene,
    readonly index: BoardIndex,
    readonly viaLabelIndex: ViaLabelIndex,
    readonly trackLabelIndex: TrackLabelIndex,
    readonly areaLabelIndex: AreaLabelIndex,
    readonly packets: GpuBatchSet,
    readonly uploader: WebGPUBatchUploader,
  ) {
    this.zoneById = new Map(source.zones.map((zone) => [zone.id, zone]));
    this.batches = packets.batches;
    uploader.indexZoneBatches(this.batches);
  }
  order(display: DisplayOptions) {
    this.batches = BoardDisplay.orderBatches(this.batches, display);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    try {
      this.packets.dispose();
    } finally {
      this.uploader.dispose();
      this.batches = [];
      this.zoneById.clear();
    }
  }
}
