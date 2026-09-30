import type { ProgressReporter } from "../progress";
import { LatestTask } from "../latest-task";
import { nextFrame, withAbort } from "../async-wait";
import { OverlayController } from "./overlay-controller";
import { GpuScene } from "./gpu-scene";
import { ScenePreparation } from "./scene-preparation";
import { BoardDisplay } from "../board/display";
import type { BoardScene, Bounds, Point, Zone } from "../board/model";
/// <reference types="@webgpu/types" />

import { type DisplayOptions } from "../board/display";
import type { SearchItem } from "../board/search";
import { Disposables, runCleanup } from "../disposable";
import type { ViewportInsets } from "../interaction/camera";
import { BoardViewport } from "../interaction/board-viewport";
import { CanvasInteractionController } from "../interaction/canvas-interaction";
import { TooltipController } from "../interaction/tooltip-controller";
import {
  type PickFilter,
  type PickHit,
  type Selection,
  type SelectionMode,
} from "../interaction/picking";
import type { ColorMode } from "./color-mode";
import {
  Renderer,
  type NavigationTool,
  type SelectionTaskState,
} from "./renderer";
import { WebGPUFrame } from "./webgpu-frame";
import { WebGPUResources } from "./webgpu-resources";

export class WebGPURenderer extends Renderer {
  private readonly events = new AbortController();
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
  private readonly viewport: BoardViewport;
  private readonly input: CanvasInteractionController;
  private readonly tooltip: TooltipController;

  readonly getView = () => this.viewport.getView();
  readonly subscribeView = (listener: () => void) =>
    this.viewport.subscribeView(listener);
  readonly getTooltip = () => this.tooltip.getTooltip();
  readonly subscribeTooltip = (listener: () => void) =>
    this.tooltip.subscribeTooltip(listener);

  getBoardPoint(clientX: number, clientY: number): Point | null {
    return this.viewport.getBoardPoint(clientX, clientY);
  }

  setNavigationTool(tool: NavigationTool) {
    this.input.setTool(tool);
  }

  setViewportInsets(insets: ViewportInsets) {
    this.viewport.setInsets(insets);
  }
  private readonly sceneTasks = new LatestTask();
  private interaction: { filter: PickFilter; mode: SelectionMode } = {
    filter: "all",
    mode: "object",
  };
  private constructor(private readonly resources: WebGPUResources) {
    super(resources.canvas);
    this.preparation = new ScenePreparation(
      resources.device,
      resources.labels.font,
    );
    this.viewport = new BoardViewport(
      resources.canvas,
      () => this.scene?.bounds ?? null,
      () => this.invalidate(),
    );
    this.frameRenderer = new WebGPUFrame(resources, this.viewport.camera);
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
    device.addEventListener(
      "uncapturederror",
      (e) => onError(e.error.message),
      {
        signal: this.events.signal,
      },
    );
    this.tooltip = new TooltipController({
      context: () =>
        this.scene && this.index
          ? {
              scene: this.scene,
              index: this.index,
              mode: this.interaction.mode,
            }
          : null,
      onError,
    });
    this.input = new CanvasInteractionController(canvas, this.viewport, {
      pick: (x, y) => this.pick(x, y),
      hover: (hit) => this.setHover(hit),
      select: (hit) => {
        void this.select(hit);
      },
      scheduleTooltip: (hit, point) => this.tooltip.schedule(hit, point),
      hideTooltip: () => this.tooltip.hide(),
      fit: () => this.fit(),
      resize: () => {
        this.tooltip.hide();
        this.invalidate();
      },
    });
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

  private setHover(hit: PickHit | null) {
    if (!hit) this.tooltip.hide();
    this.overlay.setHover(hit);
    this.input.setHoverCursor(hit);
  }
  private select(hit: PickHit | null) {
    return this.overlay.select(hit);
  }

  private draw() {
    this.animationFrame = 0;
    if (this.disposed) return;
    this.viewport.publishView();
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
    this.viewport.focusBounds(bounds, source.bounds);
  }

  fit() {
    this.setHover(null);
    this.viewport.fit();
  }

  zoom(factor: number) {
    this.setHover(null);
    this.viewport.zoom(factor);
  }

  private pick(clientX: number, clientY: number) {
    const point = this.viewport.worldPoint(clientX, clientY);
    return this.index && point
      ? this.index.pick(
          point,
          this.viewport.camera.scale,
          this.display,
          this.interaction.filter,
        )
      : null;
  }

  private clearScene() {
    this.overlay.clearSelected();
    this.setHover(null);
    this.input.cancel();
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
    progress?: ProgressReporter,
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
      progress?.({ phase: "等待首帧", fraction: 0.9 });
      await nextFrame(controller.signal);
      task.assertCurrent();
      await withAbort(
        this.resources.device.queue.onSubmittedWorkDone(),
        controller.signal,
      );
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
    this.viewport.setFlipped(value);
    this.setHover(null);
    this.input.cancel();
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
    const scene = this.gpuScene;
    this.gpuScene = null;
    runCleanup([
      () => this.events.abort(),
      () => this.input.dispose(),
      () => this.tooltip.dispose(),
      () => this.viewport.dispose(),
      () => this.overlay.dispose(),
      () => this.sceneTasks.dispose(),
      () => cancelAnimationFrame(this.animationFrame),
      () => scene?.dispose(),
      () => this.disposables.dispose(),
    ]);
  }
}
