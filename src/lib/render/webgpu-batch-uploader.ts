import type { BoardScene } from "../board/model";
/// <reference types="@webgpu/types" />

import type { DisplayOptions } from "../board/display";
import type { PrimitiveBatch } from "./primitive-batch";
import {
  PrimitiveBatchBuilder,
  type PrimitiveBuildOptions,
} from "./primitive-batch-builder";
import type { ColorMode } from "./color-mode";
import { BorrowedOutlineCollector } from "./borrowed-outline-collector";
import { cooperative } from "../cooperative";
import type { IDisposable } from "../disposable";

export type GpuBatch = Omit<
  PrimitiveBatch,
  "data" | "residual" | "indices" | "color"
> & {
  buffer: GPUBuffer;
  residualBuffer: GPUBuffer;
  indexBuffer?: GPUBuffer;
  colorBuffer?: GPUBuffer;
  count: number;
  firstInstance?: number;
  borrowed?: boolean;
};

export type UploadOptions =
  | { kind: "scene"; colorMode?: ColorMode }
  | { kind: "selection"; visibility?: DisplayOptions };

export class WebGPUBatchUploader implements IDisposable {
  readonly zoneBatches = new Map<
    number,
    { batch: GpuBatch; range: NonNullable<PrimitiveBatch["zones"]>[number] }
  >();
  readonly zoneOutlines = new Map<
    number,
    { batch: GpuBatch; start: number; count: number }[]
  >();

  constructor(private readonly device: GPUDevice) {}

  indexZoneBatches(batches: GpuBatch[]) {
    this.zoneBatches.clear();
    this.zoneOutlines.clear();
    for (const batch of batches) {
      for (const range of batch.zones ?? [])
        this.zoneBatches.set(range.id, { batch, range });
      for (const range of batch.outlines ?? []) {
        const entries = this.zoneOutlines.get(range.id) ?? [];
        entries.push({ batch, start: range.start, count: range.count });
        this.zoneOutlines.set(range.id, entries);
      }
    }
  }

  destroy(values: GpuBatch[]) {
    values.forEach((batch) => {
      if (batch.borrowed) return;
      batch.buffer.destroy();
      batch.residualBuffer.destroy();
      batch.indexBuffer?.destroy();
      batch.colorBuffer?.destroy();
    });
  }

  private *uploadSteps(
    value: BoardScene,
    options: UploadOptions,
  ): Generator<void, GpuBatch[]> {
    const reuseZones = options.kind === "selection";
    const uploader = this;
    const result: GpuBatch[] = [],
      allocated: GPUBuffer[] = [];
    let complete = false;
    function* uploadBuffer(
      data: Float32Array | Uint32Array,
      usage: number,
    ): Generator<void, GPUBuffer> {
      if (data.byteLength > uploader.device.limits.maxBufferSize)
        throw new Error(
          `几何缓冲区超出设备上限：${data.byteLength} / ${uploader.device.limits.maxBufferSize}`,
        );
      const buffer = uploader.device.createBuffer({
        size: Math.max(4, data.byteLength),
        usage,
        mappedAtCreation: true,
      });
      allocated.push(buffer);
      const target = new Uint8Array(buffer.getMappedRange()),
        source = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      for (let offset = 0; offset < source.length; offset += 4 * 1024 * 1024) {
        target.set(source.subarray(offset, offset + 4 * 1024 * 1024), offset);
        yield;
      }
      buffer.unmap();
      return buffer;
    }
    try {
      const buildOptions: PrimitiveBuildOptions =
        options.kind === "scene"
          ? { kind: "scene" }
          : {
              kind: "selection",
              visibility: options.visibility,
              reuseOutlines: true,
            };
      for (const batch of new PrimitiveBatchBuilder(
        value,
        options.kind === "scene" ? options.colorMode : "layer",
      ).buildSteps(buildOptions)) {
        if (!batch) {
          yield;
          continue;
        }
        if (reuseZones && batch.category === "zone") {
          for (const zone of batch.zones ?? []) {
            const source = uploader.zoneBatches.get(zone.id);
            if (!source) continue;
            const last = result.at(-1);
            if (
              last?.borrowed &&
              last.category === "zone" &&
              last.buffer === source.batch.buffer
            ) {
              // Retain selected ranges within their existing packed fill. The
              // copper draw path can combine contiguous ranges without drawing
              // any unselected zone between them.
              last.zones!.push(source.range);
              last.bounds = source.batch.bounds;
            } else
              result.push({
                ...source.batch,
                zones: [source.range],
                bounds: source.range.bounds,
                borrowed: true,
              });
          }
          yield;
          continue;
        }
        if (batch.outlineRefs) {
          for (const entry of BorrowedOutlineCollector.collectSteps(
            batch.outlineRefs,
            uploader.zoneOutlines,
          )) {
            if (entry)
              result.push({
                ...entry.batch,
                firstInstance: entry.start,
                count: entry.count,
                borrowed: true,
              });
            yield;
          }
          continue;
        }
        if (!batch.data.length) continue;
        const buffer = yield* uploadBuffer(batch.data, GPUBufferUsage.VERTEX),
          residualBuffer = yield* uploadBuffer(
            batch.residual,
            GPUBufferUsage.VERTEX,
          );
        const indexBuffer = batch.indices
          ? yield* uploadBuffer(batch.indices, GPUBufferUsage.INDEX)
          : undefined;
        const colorBuffer = batch.color
          ? yield* uploadBuffer(batch.color, GPUBufferUsage.VERTEX)
          : undefined;
        result.push({
          layer: batch.layer,
          category: batch.category,
          triangles: batch.triangles,
          arcs: batch.arcs,
          padMode: batch.padMode,
          zones: batch.zones,
          outlines: batch.outlines,
          viaLayers: batch.viaLayers,
          backdrill: batch.backdrill,
          backdrillBase: batch.backdrillBase,
          bounds: batch.bounds,
          holeChunks: batch.holeChunks,
          buffer,
          residualBuffer,
          indexBuffer,
          colorBuffer,
          count:
            batch.indices?.length ??
            batch.data.length / (batch.triangles ? 6 : batch.arcs ? 20 : 12),
        });
        yield;
      }
      complete = true;
      return result;
    } finally {
      if (!complete) allocated.forEach((buffer) => buffer.destroy());
    }
  }

  upload(
    value: BoardScene,
    options: UploadOptions = { kind: "scene" },
  ): GpuBatch[] {
    const steps = this.uploadSteps(value, options);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  }

  async uploadAsync(
    value: BoardScene,
    signal: AbortSignal,
    options: UploadOptions = { kind: "scene" },
  ) {
    const steps = this.uploadSteps(value, options),
      checkpoint =
        options.kind === "selection"
          ? cooperative(signal, 6, 16)
          : cooperative(signal);
    try {
      while (true) {
        signal.throwIfAborted();
        const step = steps.next();
        if (step.done) return step.value;
        const pause = checkpoint();
        if (pause) await pause;
      }
    } finally {
      steps.return([]);
    }
  }

  dispose() {
    this.zoneBatches.clear();
    this.zoneOutlines.clear();
  }
}
