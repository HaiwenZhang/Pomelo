import { BoardDisplay } from "../board/display";
import type { BoardScene, Zone } from "../board/model";
/// <reference types="@webgpu/types" />

import type { DisplayOptions } from "../board/display";

import type { IDisposable } from "../disposable";
import type { Camera } from "../interaction/camera";
import type { BoardObject, PickHit, Selection } from "../interaction/picking";
import type { ColorMode } from "./color-mode";
import type { AreaLabelIndex } from "./area-label-index";
import { boundsOverlap, visibleCopperRanges } from "./view-culling";
import { DrawBundleCache } from "./draw-bundle-cache";
import { LabelLayoutCache } from "./label-layout-cache";
import type { TrackLabelIndex } from "./track-label-index";
import type { ViaLabelIndex } from "./via-label-index";
import type { GpuBatch } from "./webgpu-batch-uploader";
import type { WebGPUResources } from "./webgpu-resources";

export interface FrameState {
  scene: BoardScene | null;
  colorMode?: ColorMode;
  display: DisplayOptions;
  batches: GpuBatch[];
  selectionBatches: GpuBatch[];
  hoverBatches: GpuBatch[];
  hover: PickHit | null;
  hoverMembers: BoardObject[] | null;
  selection: Selection | null;
  viaLabelIndex: ViaLabelIndex | null;
  trackLabelIndex: TrackLabelIndex | null;
  areaLabelIndex: AreaLabelIndex | null;
  zoneById: ReadonlyMap<number, Zone>;
}

export class WebGPUFrame implements IDisposable {
  readonly labelLayout = new LabelLayoutCache();
  private readonly bundles: DrawBundleCache;
  private stencil: GPUTexture | null = null;

  constructor(
    private readonly resources: WebGPUResources,
    private readonly camera: Camera,
  ) {
    this.bundles = new DrawBundleCache(resources.device, resources.format);
  }

  draw(state: FrameState) {
    const frameRenderer = this;
    const canvasBounds = frameRenderer.resources.canvas.getBoundingClientRect(),
      devicePixelRatio = window.devicePixelRatio || 1;
    const viewCenterX =
        frameRenderer.camera.x +
        (state.scene
          ? (state.scene.bounds.minX + state.scene.bounds.maxX) / 2
          : 0),
      viewCenterY =
        frameRenderer.camera.y +
        (state.scene
          ? (state.scene.bounds.minY + state.scene.bounds.maxY) / 2
          : 0);
    const halfWidth = (canvasBounds.width / 2 + 2) / frameRenderer.camera.scale,
      halfHeight = (canvasBounds.height / 2 + 2) / frameRenderer.camera.scale;
    const view = {
      minX: viewCenterX - halfWidth,
      maxX: viewCenterX + halfWidth,
      minY: viewCenterY - halfHeight,
      maxY: viewCenterY + halfHeight,
    };
    const localView = {
      minX: frameRenderer.camera.x - halfWidth,
      maxX: frameRenderer.camera.x + halfWidth,
      minY: frameRenderer.camera.y - halfHeight,
      maxY: frameRenderer.camera.y + halfHeight,
    };
    const width = Math.max(
        1,
        Math.min(
          frameRenderer.resources.device.limits.maxTextureDimension2D,
          Math.round(canvasBounds.width * devicePixelRatio),
        ),
      ),
      height = Math.max(
        1,
        Math.min(
          frameRenderer.resources.device.limits.maxTextureDimension2D,
          Math.round(canvasBounds.height * devicePixelRatio),
        ),
      );
    if (
      frameRenderer.resources.canvas.width !== width ||
      frameRenderer.resources.canvas.height !== height ||
      !frameRenderer.stencil
    ) {
      frameRenderer.resources.canvas.width = width;
      frameRenderer.resources.canvas.height = height;
      frameRenderer.stencil?.destroy();
      frameRenderer.stencil = frameRenderer.resources.device.createTexture({
        size: [width, height],
        format: "depth24plus-stencil8",
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
    }
    const values = new Float32Array([
      frameRenderer.camera.x,
      frameRenderer.camera.y,
      frameRenderer.camera.scale,
      frameRenderer.camera.horizontalSign,
      canvasBounds.width,
      canvasBounds.height,
      devicePixelRatio,
      0,
      state.display.opacity,
      state.display.filled ? 1 : 0,
      1,
      0,
      frameRenderer.camera.x - Math.fround(frameRenderer.camera.x),
      frameRenderer.camera.y - Math.fround(frameRenderer.camera.y),
      state.colorMode === "net" ? 1 : 0,
      0,
    ]);
    // Native Shapes fill/labels do not inherit Global. Shape boundaries remain
    // at Shapes=0; analytic line/arc pipelines ignore the fill multiplier.
    frameRenderer.resources.device.queue.writeBuffer(
      frameRenderer.resources.uniform,
      0,
      values,
    );
    values[8] = 1;
    values[10] = state.display.shapes;
    frameRenderer.resources.device.queue.writeBuffer(
      frameRenderer.resources.zoneUniform,
      0,
      values,
    );
    values[8] = 1;
    values[11] = 1;
    frameRenderer.resources.device.queue.writeBuffer(
      frameRenderer.resources.selectionUniform,
      0,
      values,
    );
    values[11] = state.hoverMembers ? 3 : 2;
    frameRenderer.resources.device.queue.writeBuffer(
      frameRenderer.resources.hoverUniform,
      0,
      values,
    );
    if (state.scene)
      this.labelLayout.update(
        {
          scene: state.scene,
          font: frameRenderer.resources.labels.font,
          camera: frameRenderer.camera,
          width: canvasBounds.width,
          height: canvasBounds.height,
          options: state.display,
          viaIndex: state.viaLabelIndex,
          trackIndex: state.trackLabelIndex,
          areaIndex: state.areaLabelIndex,
        },
        (batches) => frameRenderer.resources.labels.update(batches),
      );
    else {
      this.labelLayout.clear();
      frameRenderer.resources.labels.update(new Map());
    }
    const curves = frameRenderer.resources.curveFills;
    curves.beginFrame();
    if (frameRenderer.camera.scale * devicePixelRatio > 1000) {
      const prepared = new Set<Zone>();
      for (const batches of [state.batches, state.selectionBatches]) {
        if (
          batches === state.selectionBatches &&
          (state.display.opacity <= 0 || state.display.shapes <= 0)
        )
          continue;
        for (const batch of batches) {
          if (
            !batch.owner.alive ||
            batch.category !== "zone" ||
            !batch.colorBuffer ||
            !BoardDisplay.isBatchVisible(
              state.display,
              batch,
              batches === state.selectionBatches,
            )
          )
            continue;
          for (const zone of batch.zones ?? []) {
            if (zone.bounds && !boundsOverlap(zone.bounds, view)) continue;
            const source = state.zoneById.get(zone.id);
            if (
              !source ||
              prepared.has(source) ||
              !curves.eligible(
                source,
                frameRenderer.camera.scale,
                devicePixelRatio,
              )
            )
              continue;
            curves.prepare(
              source,
              view,
              state.scene
                ? [
                    (state.scene.bounds.minX + state.scene.bounds.maxX) / 2,
                    (state.scene.bounds.minY + state.scene.bounds.maxY) / 2,
                  ]
                : [0, 0],
              frameRenderer.camera.scale,
              devicePixelRatio,
            );
            prepared.add(source);
          }
        }
      }
    }
    const scissor = (
      bounds: import("../board/model").Bounds,
    ): readonly [number, number, number, number] => {
      const sx = (frameRenderer.camera.scale * width) / canvasBounds.width,
        sy = (frameRenderer.camera.scale * height) / canvasBounds.height;
      const x1 =
          width / 2 +
          (bounds.minX - viewCenterX) *
            sx *
            frameRenderer.camera.horizontalSign,
        x2 =
          width / 2 +
          (bounds.maxX - viewCenterX) *
            sx *
            frameRenderer.camera.horizontalSign;
      const left = Math.max(
          0,
          Math.min(width, Math.floor(Math.min(x1, x2) - 2)),
        ),
        right = Math.max(
          left,
          Math.min(width, Math.ceil(Math.max(x1, x2) + 2)),
        ),
        top = Math.max(
          0,
          Math.min(
            height,
            Math.floor(height / 2 - (bounds.maxY - viewCenterY) * sy - 2),
          ),
        ),
        bottom = Math.max(
          top,
          Math.min(
            height,
            Math.ceil(height / 2 - (bounds.minY - viewCenterY) * sy + 2),
          ),
        );
      return [left, top, right - left, bottom - top];
    };
    const encoder = frameRenderer.resources.device.createCommandEncoder(),
      pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: frameRenderer.resources
              .context!.getCurrentTexture()
              .createView(),
            clearValue: { r: 28 / 255, g: 32 / 255, b: 28 / 255, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
        depthStencilAttachment: {
          view: frameRenderer.stencil!.createView(),
          depthClearValue: 1,
          depthLoadOp: "clear",
          depthStoreOp: "discard",
          stencilClearValue: 0,
          stencilLoadOp: "clear",
          stencilStoreOp: "discard",
        },
      });
    pass.setPipeline(frameRenderer.resources.pipeline);
    pass.setBindGroup(0, frameRenderer.resources.bind);
    function polygon(batch: GpuBatch, count = batch.count, start = 0) {
      pass.setVertexBuffer(0, batch.buffer);
      pass.setVertexBuffer(1, batch.residualBuffer);
      if (batch.colorBuffer) pass.setVertexBuffer(2, batch.colorBuffer);
      if (batch.indexBuffer) {
        pass.setIndexBuffer(batch.indexBuffer, "uint32");
        pass.drawIndexed(count, 1, start);
      } else if (batch.spatialIndex) {
        batch.spatialIndex.visible(
          localView,
          (first, length) => pass.draw(length, 1, first),
          start,
          count,
        );
      } else pass.draw(count, 1, start);
    }
    function ordinary(
      batch: GpuBatch,
      pipeline: GPURenderPipeline,
      bind: GPUBindGroup,
      cache = true,
    ) {
      const ranges: number[] = [];
      const first = batch.triangles ? 0 : (batch.firstInstance ?? 0);
      if (batch.spatialIndex && !batch.indexBuffer)
        batch.spatialIndex.visible(
          localView,
          (start, count) => ranges.push(start, count),
          first,
          batch.count,
        );
      else ranges.push(first, batch.count);
      frameRenderer.bundles.draw(pass, batch, pipeline, bind, ranges, cache);
    }
    function copper(batch: GpuBatch, fill: GPUBindGroup, annotate = false) {
      if (batch.bounds && !boundsOverlap(batch.bounds, view)) return;
      let solidStart = 0,
        solidCount = 0;
      const flushSolid = () => {
        if (solidCount) {
          pass.setPipeline(frameRenderer.resources.solidCopperPipeline);
          pass.setBindGroup(0, fill);
          polygon(batch, solidCount, solidStart);
          solidCount = 0;
        }
      };
      for (const zone of batch.zones ?? []) {
        if (zone.bounds && !boundsOverlap(zone.bounds, view)) continue;
        const source =
          frameRenderer.camera.scale * devicePixelRatio > 1000
            ? state.zoneById.get(zone.id)
            : undefined;
        if (
          source &&
          batch.colorBuffer &&
          frameRenderer.resources.curveFills.eligible(
            source,
            frameRenderer.camera.scale,
            devicePixelRatio,
          )
        ) {
          flushSolid();
          frameRenderer.resources.curveFills.draw(
            pass,
            source,
            batch.colorBuffer,
            frameRenderer.resources.polygonBind,
            fill,
            scissor,
            width,
            height,
            annotate
              ? () =>
                  frameRenderer.resources.labels.draw(
                    pass,
                    `zone:${zone.id}`,
                    true,
                  )
              : undefined,
          );
          continue;
        }
        const outer = zone.outerCount ?? zone.count;
        if (
          outer === zone.count &&
          (!annotate || !frameRenderer.resources.labels.has(`zone:${zone.id}`))
        ) {
          if (solidCount && solidStart + solidCount !== zone.start)
            flushSolid();
          if (!solidCount) solidStart = zone.start;
          solidCount += zone.count;
          continue;
        }
        flushSolid();
        pass.setPipeline(frameRenderer.resources.maskPipeline);
        pass.setBindGroup(0, frameRenderer.resources.polygonBind);
        pass.setStencilReference(1);
        polygon(batch, outer, zone.start);
        // Clearing every hole implements outer minus union(holes), including
        // overlapping or nested voids, without parity/XOR cancellation.
        if (zone.count > outer) {
          pass.setStencilReference(0);
          if (batch.holeChunks)
            for (const range of visibleCopperRanges(batch.holeChunks, view))
              polygon(batch, range.count, range.start);
          else polygon(batch, zone.count - outer, zone.start + outer);
        }
        pass.setPipeline(frameRenderer.resources.copperPipeline);
        pass.setBindGroup(0, fill);
        pass.setStencilReference(1);
        polygon(batch, outer, zone.start);
        if (annotate)
          frameRenderer.resources.labels.draw(pass, `zone:${zone.id}`, true);
        pass.setPipeline(frameRenderer.resources.maskPipeline);
        pass.setBindGroup(0, frameRenderer.resources.polygonBind);
        pass.setStencilReference(0);
        polygon(batch, outer, zone.start);
      }
      flushSolid();
    }
    for (let index = 0; index < state.batches.length; index++) {
      const batch = state.batches[index];
      const next = state.batches[index + 1];
      const annotations = () => {
        if (
          !next ||
          next.category !== batch.category ||
          next.layer !== batch.layer
        ) {
          if (
            (batch.category === "etch" ||
              batch.category === "pin" ||
              batch.category === "bond-wire") &&
            BoardDisplay.isVisible(state.display, batch.layer, batch.category)
          )
            frameRenderer.resources.labels.draw(
              pass,
              `${batch.category}:${batch.layer}`,
            );
          if (batch.category === "drill")
            frameRenderer.resources.labels.draw(pass, "drill");
        }
      };
      if (
        !batch.owner.alive ||
        !BoardDisplay.isBatchVisible(state.display, batch)
      ) {
        annotations();
        continue;
      }
      if (batch.category === "zone")
        copper(batch, frameRenderer.resources.zoneBind, true);
      else if (batch.msdf !== undefined)
        frameRenderer.resources.labels.drawBatch(pass, batch, localView);
      else
        ordinary(
          batch,
          batch.triangles
            ? frameRenderer.resources.polygonPipeline
            : batch.arcs
              ? frameRenderer.resources.arcPipeline
              : frameRenderer.resources.pipeline,
          batch.triangles
            ? frameRenderer.resources.polygonBind
            : batch.category === "zone-outline"
              ? batch.arcs
                ? frameRenderer.resources.zoneBind
                : frameRenderer.resources.zoneOutlineBind
              : batch.arcs
                ? frameRenderer.resources.polygonBind
                : frameRenderer.resources.bind,
        );
      annotations();
    }
    function overlay(values: GpuBatch[], hovering: boolean) {
      if (state.display.opacity <= 0) return;
      for (const batch of values) {
        if (
          !batch.owner.alive ||
          !BoardDisplay.isBatchVisible(state.display, batch, true) ||
          (batch.category === "zone" && (hovering || state.display.shapes <= 0))
        )
          continue;
        if (batch.category === "zone")
          copper(batch, frameRenderer.resources.selectionPolygonBind);
        else if (batch.msdf !== undefined)
          frameRenderer.resources.labels.drawBatch(
            pass,
            batch,
            localView,
            hovering
              ? frameRenderer.resources.hoverUniform
              : frameRenderer.resources.selectionUniform,
          );
        else
          ordinary(
            batch,
            batch.triangles
              ? frameRenderer.resources.polygonPipeline
              : batch.arcs
                ? frameRenderer.resources.arcPipeline
                : frameRenderer.resources.pipeline,
            batch.triangles || batch.arcs
              ? hovering
                ? frameRenderer.resources.hoverPolygonBind
                : frameRenderer.resources.selectionPolygonBind
              : hovering
                ? frameRenderer.resources.hoverBind
                : frameRenderer.resources.selectionBind,
            false,
          );
      }
    }
    overlay(state.selectionBatches, false);
    if (
      state.hover &&
      !(state.hoverMembers
        ? state.selection?.objects === state.hoverMembers
        : state.selection?.objects.includes(state.hover.object))
    )
      overlay(state.hoverBatches, true);
    pass.end();
    frameRenderer.resources.device.queue.submit([encoder.finish()]);
    frameRenderer.resources.curveFills.finishFrame();
  }

  dispose() {
    this.bundles.dispose();
    this.labelLayout.clear();
    this.stencil?.destroy();
    this.stencil = null;
  }
}
