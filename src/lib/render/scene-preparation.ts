import type { ProgressReporter } from "../progress";
import type { BoardScene } from "../board/model";
import { BoardIndex } from "../interaction/picking";
import { prepareBoardText } from "../text/board-text-preparation";
import { ViaLabelIndex } from "./via-label-index";
import { TrackLabelIndex } from "./track-label-index";
import { AreaLabelIndex } from "./area-label-index";
import type { FontAtlas } from "./font-metrics";
import { WebGPUBatchUploader } from "./webgpu-batch-uploader";
import { GpuScene } from "./gpu-scene";
import { cleanupAfterFailure } from "../disposable";

/** CPU preparation and upload publish a single owned result. No viewer state is
 * changed here; cancellation/failure cannot publish a partially prepared board. */
export class ScenePreparation {
  constructor(
    private readonly device: GPUDevice,
    private readonly font: FontAtlas,
    private readonly prepareFont?: (
      scene: BoardScene,
      signal: AbortSignal,
    ) => Promise<void>,
  ) {}

  create(source: BoardScene) {
    const index = new BoardIndex(source);
    const vias = new ViaLabelIndex(source.vias);
    const tracks = new TrackLabelIndex(source.segments, source.nets, this.font);
    const areas = new AreaLabelIndex(source, this.font);
    const uploader = new WebGPUBatchUploader(this.device);
    const packets = uploader.upload(source, {
      kind: "scene",
      colorMode: "dynamic",
    });
    try {
      return new GpuScene(
        source,
        index,
        vias,
        tracks,
        areas,
        packets,
        uploader,
      );
    } catch (error) {
      cleanupAfterFailure(error, [
        () => packets.dispose(),
        () => uploader.dispose(),
      ]);
    }
  }

  async prepare(
    source: BoardScene,
    signal: AbortSignal,
    progress?: ProgressReporter,
  ) {
    signal.throwIfAborted();
    progress?.({ phase: "读取原始文字字形", fraction: 0 });
    await prepareBoardText(source, signal);
    await this.prepareFont?.(source, signal);
    progress?.({ phase: "构建拾取索引", fraction: 0.15 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const index = await BoardIndex.create(source, signal);
    progress?.({ phase: "构建过孔标注索引", fraction: 0.3 });
    const vias = await ViaLabelIndex.create(source.vias, signal);
    progress?.({ phase: "构建走线标注索引", fraction: 0.45 });
    const tracks = await TrackLabelIndex.create(
      source.segments,
      source.nets,
      this.font,
      signal,
    );
    progress?.({ phase: "构建焊盘与铜皮标注索引", fraction: 0.6 });
    const areas = await AreaLabelIndex.create(source, this.font, signal);
    progress?.({ phase: "上传板图", fraction: 0.75 });
    const uploader = new WebGPUBatchUploader(this.device);
    const packets = await uploader.uploadAsync(source, signal, {
      kind: "scene",
      colorMode: "dynamic",
    });
    try {
      signal.throwIfAborted();
      return new GpuScene(
        source,
        index,
        vias,
        tracks,
        areas,
        packets,
        uploader,
      );
    } catch (error) {
      cleanupAfterFailure(error, [
        () => packets.dispose(),
        () => uploader.dispose(),
      ]);
    }
  }
}
