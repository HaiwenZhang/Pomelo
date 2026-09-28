import { LatestTask, type TaskTicket } from "./latest-task";
import { OverlayController } from "./overlay-controller";
import { GpuScene } from "./gpu-scene";
import { ScenePreparation } from "./scene-preparation";
import { BoardDisplay } from "../board/display";
import type { BoardScene, Bounds, Point, Zone } from "../board/model";
/// <reference types="@webgpu/types" />

import { type DisplayOptions } from "../board/display";
import type { SearchItem } from "../board/search";
import { Disposables } from "../disposable";
import { Camera, type ViewportInsets } from "../interaction/camera";
import { canvasBoardPoint } from "../interaction/cursor-coordinate";
import { hoverDetails } from "../interaction/hover-details";
import {
  type PickFilter,
  type PickHit,
  type Selection,
  type SelectionMode,
} from "../interaction/picking";
import type { ColorMode } from "./color-mode";
import {
  Renderer,
  type HoverTooltip,
  type NavigationTool,
  type ViewState,
  type SelectionTaskState,
} from "./renderer";
import { WebGPUFrame } from "./webgpu-frame";
import { WebGPUResources } from "./webgpu-resources";

const TOOLTIP_DELAY = 350;

export class WebGPURenderer extends Renderer {
  private readonly disposables = new Disposables();
  private readonly preparation: ScenePreparation;
  private readonly overlay: OverlayController;
  private gpuScene: GpuScene | null = null;
  private get index() {
    return this.gpuScene?.index ?? null;
  }
  private get viaLabelIndex() {
    return this.gpuScene?.viaLabelIndex ?? null;
  }
  private get trackLabelIndex() {
    return this.gpuScene?.trackLabelIndex ?? null;
  }
  private get areaLabelIndex() {
    return this.gpuScene?.areaLabelIndex ?? null;
  }
  private get zoneById() {
    return this.gpuScene?.zoneById ?? new Map<number, Zone>();
  }
  private get batches() {
    return this.gpuScene?.batches ?? [];
  }
  private readonly frameRenderer: WebGPUFrame;
  private animationFrame = 0;
  private get scene() {
    return this.gpuScene?.source ?? null;
  }
  private display = BoardDisplay.createDisplayOptions();
  private colorMode: ColorMode = "net";
  private readonly camera = new Camera();
  private navigationTool: NavigationTool = "select";
  private insets: ViewportInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  private fitScale = 10;
  private view: ViewState = { zoom: 100, pixelsPerMm: 10 };
  private readonly viewListeners = new Set<() => void>();
  private readonly tooltipListeners = new Set<() => void>();
  private tooltip: HoverTooltip | null = null;

  readonly getView = () => this.view;
  getBoardPoint(clientX: number, clientY: number): Point | null {
    return canvasBoardPoint(
      this.camera,
      this.scene?.bounds ?? null,
      this.resources.canvas.getBoundingClientRect(),
      clientX,
      clientY,
    );
  }
  readonly subscribeView = (listener: () => void) => {
    this.viewListeners.add(listener);
    return () => {
      this.viewListeners.delete(listener);
    };
  };
  readonly getTooltip = () => this.tooltip;
  readonly subscribeTooltip = (listener: () => void) => {
    this.tooltipListeners.add(listener);
    return () => {
      this.tooltipListeners.delete(listener);
    };
  };

  private setTooltip(value: HoverTooltip | null) {
    if (this.tooltip === value) return;
    this.tooltip = value;
    this.tooltipListeners.forEach((listener) => listener());
  }

  setNavigationTool(tool: NavigationTool) {
    this.navigationTool = tool;
    this.setHover(null);
    this.cancel();
    this.resources.canvas.style.cursor = tool === "pan" ? "grab" : "default";
  }

  setViewportInsets(insets: ViewportInsets) {
    this.insets = insets;
  }
  private readonly sceneTasks = new LatestTask();
  private readonly tooltipTasks = new LatestTask();
  private interaction: { filter: PickFilter; mode: SelectionMode } = {
    filter: "all",
    mode: "object",
  };
  private tooltipTimer: ReturnType<typeof setTimeout> | undefined;
  private tooltipJob: TaskTicket | null = null;
  private pointer: {
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    button: number;
    dragging: boolean;
  } | null = null;
  private observer: ResizeObserver;

  private readonly wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.setHover(null);
    const canvasBounds = this.resources.canvas.getBoundingClientRect();
    this.camera.zoom(
      Math.exp(-Math.max(-200, Math.min(200, e.deltaY)) * 0.006),
      e.clientX - canvasBounds.left,
      e.clientY - canvasBounds.top,
      canvasBounds.width,
      canvasBounds.height,
    );
    this.invalidate();
  };

  private readonly down = (e: PointerEvent) => {
    if (e.button > 1) return;
    this.resources.canvas.focus({ preventScroll: true });
    this.pointer = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      button: e.button,
      dragging: e.button === 1 || this.navigationTool === "pan",
    };
    this.setHover(null);
    this.resources.canvas.setPointerCapture(e.pointerId);
  };

  private readonly move = (e: PointerEvent) => {
    if (!this.pointer) {
      if (this.navigationTool === "pan") return;
      const hit = this.pick(e),
        canvasBounds = this.resources.canvas.getBoundingClientRect();
      this.setHover(hit);
      this.scheduleTooltip(hit, [
        e.clientX - canvasBounds.left,
        e.clientY - canvasBounds.top,
      ]);
      return;
    }
    if (this.pointer.id !== e.pointerId) return;
    if (
      !this.pointer.dragging &&
      Math.hypot(
        e.clientX - this.pointer.startX,
        e.clientY - this.pointer.startY,
      ) > 4
    )
      this.pointer.dragging = true;
    if (this.pointer.dragging) {
      this.camera.pan(e.clientX - this.pointer.x, e.clientY - this.pointer.y);
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.resources.canvas.style.cursor = "grabbing";
      this.invalidate();
    }
  };

  private readonly up = (e: PointerEvent) => {
    if (this.pointer?.id !== e.pointerId) return;
    const click = this.pointer.button === 0 && !this.pointer.dragging;
    this.pointer = null;
    this.resources.canvas.style.cursor =
      this.navigationTool === "pan" ? "grab" : "default";
    if (click) this.select(this.pick(e));
    if (this.resources.canvas.hasPointerCapture(e.pointerId))
      this.resources.canvas.releasePointerCapture(e.pointerId);
  };

  private readonly cancel = () => {
    this.pointer = null;
    this.hideTooltip();
    this.resources.canvas.style.cursor =
      this.navigationTool === "pan" ? "grab" : "default";
  };

  private readonly leave = () => {
    if (!this.pointer) this.setHover(null);
  };

  private readonly key = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLElement &&
      e.target.closest("input,select,textarea,[contenteditable=true]")
    )
      return;
    if (e.key === "F2") {
      e.preventDefault();
      this.setHover(null);
      this.fit();
    }
    if (e.key === "Escape") {
      this.setHover(null);
      this.select(null);
    }
  };

  private readonly blur = () => this.setHover(null);

  private constructor(private readonly resources: WebGPUResources) {
    super(resources.canvas);
    this.preparation = new ScenePreparation(
      resources.device,
      resources.labels.font,
    );
    this.frameRenderer = new WebGPUFrame(resources, this.camera);
    this.overlay = new OverlayController(resources, {
      scene: () => this.gpuScene,
      display: () => this.display,
      mode: () => this.interaction.mode,
      invalidate: () => this.invalidate(),
      focusBounds: (bounds, source) => this.focusBounds(bounds, source),
    });
    this.disposables.add(this.frameRenderer);
    this.disposables.add(resources);
    const { canvas, device, onError } = resources;
    device.lost.then((info) => {
      if (!this.disposed) {
        this.dispose();
        onError(`图形设备中断：${info.message || info.reason}`);
      }
    });
    device.addEventListener("uncapturederror", (e) => onError(e.error.message));
    canvas.addEventListener("wheel", this.wheel, { passive: false });
    canvas.addEventListener("pointerdown", this.down);
    canvas.addEventListener("pointermove", this.move);
    canvas.addEventListener("pointerup", this.up);
    canvas.addEventListener("pointercancel", this.cancel);
    canvas.addEventListener("lostpointercapture", this.cancel);
    canvas.addEventListener("pointerleave", this.leave);
    window.addEventListener("keydown", this.key);
    this.observer = new ResizeObserver(() => {
      this.hideTooltip();
      this.invalidate();
    });
    this.observer.observe(canvas);
    window.addEventListener("blur", this.blur);
    this.invalidate();
  }

  static async create(
    canvas: HTMLCanvasElement,
    onError: (message: string) => void,
    signal?: AbortSignal,
    onSelection?: (selection: Selection | null) => void,
    onSelectionTask?: (state: SelectionTaskState | null) => void,
  ): Promise<WebGPURenderer> {
    const resources = await WebGPUResources.create(
      canvas,
      onError,
      signal,
      onSelection,
      onSelectionTask,
    );
    try {
      signal?.throwIfAborted();
      return new WebGPURenderer(resources);
    } catch (error) {
      resources.dispose();
      throw error;
    }
  }

  private hideTooltip() {
    clearTimeout(this.tooltipTimer);
    this.tooltipTimer = undefined;
    this.tooltipTasks.cancel();
    this.tooltipJob = null;
    this.setTooltip(null);
  }

  private scheduleTooltip(hit: PickHit | null, point: Point) {
    this.hideTooltip();
    if (!hit || !this.scene || !this.index) return;
    const source = this.scene,
      sourceIndex = this.index,
      mode = this.interaction.mode,
      job = this.tooltipTasks.start();
    this.tooltipJob = job;
    this.tooltipTimer = setTimeout(async () => {
      this.tooltipTimer = undefined;
      try {
        const lines = await hoverDetails(
          source,
          sourceIndex,
          hit,
          mode,
          job.signal,
        );
        if (
          job.signal.aborted ||
          this.disposed ||
          this.scene !== source ||
          this.tooltipJob !== job
        )
          return;
        this.setTooltip({ lines, point });
      } catch (error) {
        if (!job.signal.aborted && !this.disposed) {
          this.setTooltip(null);
          this.resources.onError(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        job.finish();
      }
    }, TOOLTIP_DELAY);
  }

  private setHover(hit: PickHit | null) {
    if (!hit) this.hideTooltip();
    this.overlay.setHover(hit);
    this.resources.canvas.style.cursor = hit
      ? "pointer"
      : this.navigationTool === "pan"
        ? "grab"
        : "default";
  }
  private select(hit: PickHit | null) {
    return this.overlay.select(hit);
  }

  private draw() {
    this.animationFrame = 0;
    if (this.disposed) return;
    const zoom = (this.camera.scale / this.fitScale) * 100;
    if (
      this.view.zoom !== zoom ||
      this.view.pixelsPerMm !== this.camera.scale
    ) {
      this.view = { zoom, pixelsPerMm: this.camera.scale };
      this.viewListeners.forEach((listener) => listener());
    }
    this.frameRenderer.draw({
      scene: this.scene,
      colorMode: this.colorMode,
      display: this.display,
      batches: this.batches,
      selectionBatches: this.overlay.selectionBatches,
      hoverBatches: this.overlay.hoverBatches,
      hover: this.overlay.hover,
      hoverMembers: this.overlay.hoverMembers,
      selection: this.overlay.selection,
      viaLabelIndex: this.viaLabelIndex,
      trackLabelIndex: this.trackLabelIndex,
      areaLabelIndex: this.areaLabelIndex,
      zoneById: this.zoneById,
    });
  }

  private invalidate() {
    if (!this.disposed && !this.animationFrame)
      this.animationFrame = requestAnimationFrame(() => this.draw());
  }

  private focusBounds(bounds: Bounds, source: BoardScene) {
    const canvasBounds = this.resources.canvas.getBoundingClientRect();
    this.camera.x =
      (bounds.minX + bounds.maxX - source.bounds.minX - source.bounds.maxX) / 2;
    this.camera.y =
      (bounds.minY + bounds.maxY - source.bounds.minY - source.bounds.maxY) / 2;
    this.camera.scale =
      Math.min(
        400,
        Math.max(1, canvasBounds.width - this.insets.left - this.insets.right) /
          Math.max(3, bounds.maxX - bounds.minX),
        Math.max(
          1,
          canvasBounds.height - this.insets.top - this.insets.bottom,
        ) / Math.max(3, bounds.maxY - bounds.minY),
      ) * 0.72;
    this.camera.x +=
      ((this.insets.right - this.insets.left) / (2 * this.camera.scale)) *
      this.camera.horizontalSign;
    this.camera.y +=
      (this.insets.top - this.insets.bottom) / (2 * this.camera.scale);
    this.invalidate();
  }

  fit() {
    this.setHover(null);
    if (this.scene) {
      const canvasBounds = this.resources.canvas.getBoundingClientRect();
      this.camera.fit(
        this.scene.bounds,
        canvasBounds.width,
        canvasBounds.height,
        this.insets,
      );
      this.fitScale = this.camera.scale;
      this.invalidate();
    }
  }

  zoom(factor: number) {
    this.setHover(null);
    const canvasBounds = this.resources.canvas.getBoundingClientRect();
    this.camera.zoom(
      factor,
      (canvasBounds.width + this.insets.left - this.insets.right) / 2,
      (canvasBounds.height + this.insets.top - this.insets.bottom) / 2,
      canvasBounds.width,
      canvasBounds.height,
    );
    this.invalidate();
  }

  private pick(e: PointerEvent) {
    const canvasBounds = this.resources.canvas.getBoundingClientRect();
    return this.index && this.scene
      ? this.index.pick(
          this.camera.worldPoint(
            e.clientX - canvasBounds.left,
            e.clientY - canvasBounds.top,
            canvasBounds.width,
            canvasBounds.height,
            this.scene.bounds,
          ),
          this.camera.scale,
          this.display,
          this.interaction.filter,
        )
      : null;
  }

  private clearScene() {
    this.overlay.clearSelected();
    this.setHover(null);
    this.cancel();
    this.gpuScene?.dispose();
    this.gpuScene = null;
    this.resources.labels.clear();
    this.frameRenderer.labelLayout.clear();
    this.resources.curveFills.clear();
    this.invalidate();
  }

  private attachScene(value: GpuScene) {
    this.gpuScene = value;
    value.order(this.display);
    this.fit();
  }

  setScene(value: BoardScene | null) {
    this.sceneTasks.cancel();
    this.clearScene();
    if (value) this.attachScene(this.preparation.create(value));
  }

  async prepareScene(
    value: BoardScene,
    signal: AbortSignal,
    progress?: (phase: string) => void,
  ) {
    signal.throwIfAborted();
    if (this.disposed) throw new Error("渲染器已关闭");
    this.sceneTasks.cancel();
    this.clearScene();
    const task = this.sceneTasks.start(signal),
      controller = task.controller;
    let prepared: GpuScene | null = null;
    try {
      prepared = await this.preparation.prepare(
        value,
        controller.signal,
        progress,
      );
      task.assertCurrent();
      this.attachScene(prepared);
      prepared = null;
      progress?.("等待首帧");
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      task.assertCurrent();
      await this.resources.device.queue.onSubmittedWorkDone();
      task.assertCurrent();
    } catch (error) {
      prepared?.dispose();
      if (task.isCurrent) this.clearScene();
      throw error;
    } finally {
      task.finish();
    }
  }

  setDisplay(value: DisplayOptions) {
    if (
      value.activeLayer !== this.display.activeLayer ||
      value.priorities !== this.display.priorities
    )
      this.gpuScene?.order(value);
    this.display = value;
    this.setHover(null);
    this.invalidate();
  }

  setColorMode(mode: ColorMode) {
    if (this.colorMode === mode) return;
    this.colorMode = mode;
    this.invalidate();
  }

  setInteraction(value: { filter: PickFilter; mode: SelectionMode }) {
    const changed = value.mode !== this.interaction.mode,
      anchor =
        this.overlay.pendingSelection?.requested?.anchor ??
        this.overlay.selection?.anchor;
    this.interaction = value;
    this.setHover(null);
    if (changed) {
      if (anchor) this.select(anchor);
      else if (this.overlay.pendingSelection) this.overlay.clearSelected();
    }
  }

  clearSelection() {
    this.setHover(null);
    this.select(null);
  }

  setFlipped(value: boolean) {
    this.camera.flipped = value;
    this.setHover(null);
    this.cancel();
    this.invalidate();
  }

  locate(item: SearchItem) {
    if (!this.scene || !this.index || this.disposed) return Promise.resolve();
    this.setHover(null);
    this.interaction = { ...this.interaction, mode: item.kind };
    const lookup = this.index.locateSteps(item, this.display),
      first = lookup.next();
    if (first.done) {
      if (first.value.bounds) this.focusBounds(first.value.bounds, this.scene);
      return this.overlay.startSelection(first.value.selection);
    }
    return this.overlay.startSelection(null, lookup);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.viewListeners.clear();
    this.overlay.dispose();
    this.hideTooltip();
    this.tooltipListeners.clear();
    window.removeEventListener("blur", this.blur);
    this.sceneTasks.cancel();
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    this.resources.canvas.removeEventListener("wheel", this.wheel);
    this.resources.canvas.removeEventListener("pointerdown", this.down);
    this.resources.canvas.removeEventListener("pointermove", this.move);
    this.resources.canvas.removeEventListener("pointerup", this.up);
    this.resources.canvas.removeEventListener("pointercancel", this.cancel);
    this.resources.canvas.removeEventListener(
      "lostpointercapture",
      this.cancel,
    );
    this.resources.canvas.removeEventListener("pointerleave", this.leave);
    window.removeEventListener("keydown", this.key);
    this.sceneTasks.dispose();
    this.tooltipTasks.dispose();
    this.gpuScene?.dispose();
    this.gpuScene = null;
    this.disposables.dispose();
  }
}
