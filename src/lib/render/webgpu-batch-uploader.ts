import { GpuGeometry } from "./gpu-geometry";
import { GpuBatchSet } from "./gpu-batch-set";
import { BatchRangeIndex } from "./batch-range-index";
import type { BoardScene } from "../board/model";
/// <reference types="@webgpu/types" />

import type { DisplayOptions } from "../board/display";
import type { PrimitiveBatch } from "./primitive-batch";
import {
  PrimitiveBatchBuilder,
  type PrimitiveBuildOptions,
} from "./primitive-batch-builder";
import type { ColorMode } from "./color-mode";
import { collectBorrowedOutlines } from "./borrowed-outline-collector";
import { completeSteps, completeStepsAsync } from "../iteration";
import { runCleanup, type IDisposable } from "../disposable";
import { primitiveLayout } from "./primitive-layout";

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
  readonly owner: GpuGeometry;
  spatialIndex?: BatchRangeIndex;
};

export type UploadOptions =
  | { kind: "scene"; colorMode?: ColorMode | "dynamic" }
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

  private *uploadSteps(
    value: BoardScene,
    options: UploadOptions,
  ): Generator<void, GpuBatchSet> {
    const reuseZones = options.kind === "selection";
    const uploader = this;
    const packets = new GpuBatchSet(),
      result = packets.batches,
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
              last &&
              last.category === "zone" &&
              last.owner === source.batch.owner
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
              });
          }
          yield;
          continue;
        }
        if (batch.outlineRefs) {
          for (const entry of collectBorrowedOutlines(
            batch.outlineRefs,
            uploader.zoneOutlines,
          )) {
            if (entry)
              result.push({
                ...entry.batch,
                firstInstance: entry.start,
                count: entry.count,
              });
            yield;
          }
          continue;
        }
        if (!batch.data.length) continue;
        const spatialIndex = yield* BatchRangeIndex.buildSteps(batch);
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
        const owner = new GpuGeometry(allocated.splice(0));
        packets.own(owner);
        result.push({
          owner,
          spatialIndex,
          layer: batch.layer,
          category: batch.category,
          triangles: batch.triangles,
          arcs: batch.arcs,
          msdf: batch.msdf,
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
            batch.data.length / primitiveLayout(batch).stride,
        });
        yield;
      }
      complete = true;
      return packets;
    } finally {
      if (!complete) {
        runCleanup([
          () => packets.dispose(),
          ...allocated.map((buffer) => () => buffer.destroy()),
        ]);
      }
    }
  }

  upload(
    value: BoardScene,
    options: UploadOptions = { kind: "scene" },
  ): GpuBatchSet {
    return completeSteps(this.uploadSteps(value, options));
  }

  async uploadAsync(
    value: BoardScene,
    signal: AbortSignal,
    options: UploadOptions = { kind: "scene" },
  ) {
    return completeStepsAsync(
      this.uploadSteps(value, options),
      signal,
      options.kind === "selection" ? 6 : 8,
      options.kind === "selection" ? 16 : 50,
    );
  }

  dispose() {
    this.zoneBatches.clear();
    this.zoneOutlines.clear();
  }
}
