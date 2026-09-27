import { BoardDisplay } from "../board/display";
import type { BoardScene, Bounds, Point, Zone } from "../board/model";
/// <reference types="@webgpu/types" />

import { type DisplayOptions } from "../board/display";
import type { SearchItem } from "../board/search";
import { cooperative } from "../cooperative";
import { Disposables } from "../disposable";
import { Camera, type ViewportInsets } from "../interaction/camera";
import { canvasBoardPoint } from "../interaction/cursor-coordinate";
import { hoverDetails } from "../interaction/hover-details";
import {
  BoardIndex,
  selectionScene,
  selectionSceneSteps,
  type BoardObject,
  type PickFilter,
  type PickHit,
  type Selection,
  type SelectionMode,
} from "../interaction/picking";
import { AreaLabelIndex } from "./area-label-index";
import type { ColorMode } from "./color-mode";
import {
  Renderer,
  type HoverTooltip,
  type NavigationTool,
  type ViewState,
  type SelectionTaskState,
} from "./renderer";
import { StrokeFont } from "../text/stroke-font";
import { TrackLabelIndex } from "./track-label-index";
import { ViaLabelIndex } from "./via-label-index";
import { WebGPUBatchUploader, type GpuBatch } from "./webgpu-batch-uploader";
import { WebGPUFrame } from "./webgpu-frame";
import { WebGPUResources } from "./webgpu-resources";

const TOOLTIP_DELAY = 350;

export class WebGPURenderer extends Renderer {
  private readonly disposables = new Disposables();
  private readonly uploader: WebGPUBatchUploader;
  private readonly frameRenderer: WebGPUFrame;
  private animationFrame = 0;
  private scene: BoardScene | null = null;
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
  private zoneById = new Map<number, Zone>();
  private batches: GpuBatch[] = [];
  private selectionBatches: GpuBatch[] = [];
  private hoverBatches: GpuBatch[] = [];
  private index: BoardIndex | null = null;
  private selection: Selection | null = null;
  private hover: PickHit | null = null;
  private viaLabelIndex: ViaLabelIndex | null = null;
  private trackLabelIndex: TrackLabelIndex | null = null;
  private areaLabelIndex: AreaLabelIndex | null = null;
  private hoverMembers: BoardObject[] | null = null;
  private pendingHover: AbortController | null = null;
  private pendingScene: AbortController | null = null;
  private pendingColor: AbortController | null = null;
  private pendingSelection: {
    controller: AbortController;
    requested: Selection | null;
  } | null = null;
  private interaction: { filter: PickFilter; mode: SelectionMode } = {
    filter: "all",
    mode: "object",
  };
  private tooltipTimer: ReturnType<typeof setTimeout> | undefined;
  private tooltipJob: AbortController | null = null;
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
    this.uploader = new WebGPUBatchUploader(resources.device);
    this.frameRenderer = new WebGPUFrame(resources, this.camera);
    this.disposables.add(this.frameRenderer);
    this.disposables.add(this.uploader);
    this.disposables.add(resources);
    const { canvas, device, onError } = resources;
    device.lost.then((info) => {
      if (!this.disposed)
        onError(`图形设备中断：${info.message || info.reason}`);
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
    this.tooltipJob?.abort();
    this.tooltipJob = null;
    this.setTooltip(null);
  }

  private scheduleTooltip(hit: PickHit | null, point: Point) {
    this.hideTooltip();
    if (!hit || !this.scene || !this.index) return;
    const source = this.scene,
      sourceIndex = this.index,
      mode = this.interaction.mode,
      job = new AbortController();
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
      }
    }, TOOLTIP_DELAY);
  }

  private clearSelected() {
    this.pendingSelection?.controller.abort();
    this.pendingSelection = null;
    this.selection = null;
    this.uploader.destroy(this.selectionBatches);
    this.selectionBatches = [];
    this.resources.onSelection?.(null);
    this.resources.onSelectionTask?.(null);
    this.invalidate();
  }

  private async collect<T>(
    steps: Generator<void, T>,
    signal: AbortSignal,
  ): Promise<T> {
    const checkpoint = cooperative(signal, 6, 16);
    try {
      while (true) {
        signal.throwIfAborted();
        const step = steps.next();
        if (step.done) return step.value;
        const pause = checkpoint();
        if (pause) await pause;
      }
    } finally {
      steps.return(undefined as T);
    }
  }

  private startSelection(
    value: Selection | null,
    lookup?: Generator<
      void,
      { selection: Selection | null; bounds: Bounds | null }
    >,
  ) {
    this.clearSelected();
    if (!this.scene || (!value && !lookup)) return Promise.resolve();
    const source = this.scene,
      job = { controller: new AbortController(), requested: value };
    this.pendingSelection = job;
    const signal = job.controller.signal;
    this.resources.onSelectionTask?.({
      phase: lookup ? "查找对象" : "准备选择",
    });
    return (async () => {
      let owned: GpuBatch[] = [];
      try {
        // Let the sidebar paint its cancellation control before expensive work.
        await new Promise((resolve) => setTimeout(resolve, 0));
        signal.throwIfAborted();
        if (lookup) {
          const found = await this.collect(lookup, signal);
          value = found.selection;
          job.requested = value;
          if (found.bounds) this.focusBounds(found.bounds, source);
        }
        if (!value) return;
        const selectedScene = await this.collect(
          selectionSceneSteps(source, value.objects),
          signal,
        );
        this.resources.onSelectionTask?.({ phase: "上传选择高亮" });
        owned = await this.uploader.uploadAsync(selectedScene, signal, {
          kind: "selection",
        });
        signal.throwIfAborted();
        this.selectionBatches = owned;
        owned = [];
        this.selection = value;
        this.resources.onSelection?.(value);
        this.invalidate();
        this.resources.onSelectionTask?.({ phase: "显示选择" });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        signal.throwIfAborted();
        await this.resources.device.queue.onSubmittedWorkDone();
        signal.throwIfAborted();
      } catch (error) {
        this.uploader.destroy(owned);
        if (!signal.aborted && this.pendingSelection === job) {
          this.clearSelected();
          const message =
            error instanceof Error ? error.message : String(error);
          if (this.resources.onSelectionTask)
            this.resources.onSelectionTask({
              phase: "选择失败",
              error: message,
            });
          else this.resources.onError(message);
        }
      } finally {
        lookup?.return({ selection: null, bounds: null });
        if (this.pendingSelection === job) {
          this.pendingSelection = null;
          this.resources.onSelectionTask?.(null);
        }
      }
    })();
  }

  private select(hit: PickHit | null) {
    return this.startSelection(
      hit && this.index ? this.index.select(hit, this.interaction.mode) : null,
    );
  }

  private async prepareGroupHover(
    source: BoardScene,
    objects: BoardObject[],
    job: AbortController,
  ) {
    const renderer = this;
    let owned: GpuBatch[] = [];
    const visibility = renderer.display;
    try {
      // Yield out of the pointer handler before walking a large network.
      await new Promise((resolve) => setTimeout(resolve, 0));
      job.signal.throwIfAborted();
      const subset = await renderer.collect(
        selectionSceneSteps(source, objects),
        job.signal,
      );
      const zones = subset.zones;
      subset.zones = [];
      // Hover only needs copper edges. Reuse their exact existing instances,
      // avoiding both the fill upload and reconstruction of giant void lists.
      const outlines = await renderer.collect(
        (function* () {
          const result: GpuBatch[] = [];
          for (let i = 0; i < zones.length; i++) {
            if ((i & 63) === 0) yield;
            for (const {
              batch,
              start,
              count,
            } of renderer.uploader.zoneOutlines.get(zones[i].id) ?? [])
              if (BoardDisplay.isBatchVisible(visibility, batch, true))
                result.push({
                  ...batch,
                  firstInstance: start,
                  count,
                  borrowed: true,
                });
          }
          return result;
        })(),
        job.signal,
      );
      owned = await renderer.uploader.uploadAsync(subset, job.signal, {
        kind: "selection",
        visibility,
      });
      job.signal.throwIfAborted();
      if (
        renderer.disposed ||
        renderer.scene !== source ||
        renderer.pendingHover !== job
      )
        return;
      renderer.hoverBatches = BoardDisplay.orderBatches(
        [...outlines, ...owned],
        renderer.display,
      );
      owned = [];
      renderer.invalidate();
    } catch (error) {
      if (
        !job.signal.aborted &&
        !renderer.disposed &&
        renderer.pendingHover === job
      )
        renderer.resources.onError(
          error instanceof Error ? error.message : String(error),
        );
    } finally {
      renderer.uploader.destroy(owned);
      if (renderer.pendingHover === job) renderer.pendingHover = null;
    }
  }

  private setHover(hit: PickHit | null) {
    if (!hit) this.hideTooltip();
    if (
      hit?.object === this.hover?.object &&
      hit?.layer === this.hover?.layer &&
      hit?.category === this.hover?.category
    )
      return;
    this.hover = hit;
    const group =
      hit && this.index && this.interaction.mode !== "object"
        ? this.index.select(hit, this.interaction.mode)
        : null;
    const members = group && group.mode !== "object" ? group.objects : null;
    this.resources.canvas.style.cursor = hit
      ? "pointer"
      : this.navigationTool === "pan"
        ? "grab"
        : "default";
    // Index-owned arrays are stable. Crossing members of the same net must not
    // restart its preparation, upload again or repaint an unchanged overlay.
    if (members && members === this.hoverMembers) return;
    this.pendingHover?.abort();
    this.pendingHover = null;
    this.hoverMembers = members;
    this.uploader.destroy(this.hoverBatches);
    this.hoverBatches = [];
    if (members && this.scene) {
      const job = new AbortController();
      this.pendingHover = job;
      void this.prepareGroupHover(this.scene, members, job);
      this.invalidate();
      return;
    }
    // Base outlines already contain the exact high/low line and arc instances.
    // Borrow only this zone's ranges; no geometry conversion or GPU allocation.
    this.hoverBatches =
      hit?.object.kind === "zone"
        ? (this.uploader.zoneOutlines.get(hit.object.value.id) ?? []).map(
            ({ batch, start, count }) => ({
              ...batch,
              firstInstance: start,
              count,
              borrowed: true,
            }),
          )
        : hit && this.scene
          ? this.uploader.upload(selectionScene(this.scene, [hit.object]), {
              kind: "selection",
            })
          : [];
    this.invalidate();
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
      display: this.display,
      batches: this.batches,
      selectionBatches: this.selectionBatches,
      hoverBatches: this.hoverBatches,
      hover: this.hover,
      hoverMembers: this.hoverMembers,
      selection: this.selection,
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
    this.pendingColor?.abort();
    this.pendingColor = null;
    this.clearSelected();
    this.setHover(null);
    this.cancel();
    this.uploader.destroy(this.batches);
    this.batches = [];
    this.uploader.zoneBatches.clear();
    this.uploader.zoneOutlines.clear();
    this.resources.labels.clear();
    this.resources.curveFills.clear();
    this.zoneById.clear();
    this.scene = null;
    this.index = null;
    this.viaLabelIndex = null;
    this.trackLabelIndex = null;
    this.areaLabelIndex = null;
    this.invalidate();
  }

  setScene(value: BoardScene | null) {
    this.pendingScene?.abort();
    this.pendingScene = null;
    this.clearScene();
    if (value) {
      const nextIndex = new BoardIndex(value),
        nextLabels = new ViaLabelIndex(value.vias),
        nextTracks = new TrackLabelIndex(
          value.segments,
          value.nets,
          this.resources.labels.font,
        ),
        nextAreas = new AreaLabelIndex(value, this.resources.labels.font),
        nextBatches = this.uploader.upload(value, {
          kind: "scene",
          colorMode: this.colorMode,
        });
      this.scene = value;
      this.viaLabelIndex = nextLabels;
      this.trackLabelIndex = nextTracks;
      this.areaLabelIndex = nextAreas;
      this.zoneById = new Map(value.zones.map((z) => [z.id, z]));
      this.index = nextIndex;
      this.batches = BoardDisplay.orderBatches(nextBatches, this.display);
      this.uploader.indexZoneBatches(this.batches);
      this.fit();
    }
  }

  async prepareScene(
    value: BoardScene,
    signal: AbortSignal,
    progress?: (phase: string) => void,
  ) {
    signal.throwIfAborted();
    if (this.disposed) throw new Error("渲染器已关闭");
    this.pendingScene?.abort();
    this.clearScene();
    const controller = new AbortController();
    this.pendingScene = controller;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    try {
      progress?.("读取原始文字字形");
      await StrokeFont.prepare(value.texts ?? [], controller.signal);
      progress?.("构建拾取索引");
      await new Promise((resolve) => setTimeout(resolve, 0));
      const nextIndex = await BoardIndex.create(value, controller.signal);
      progress?.("构建过孔标注索引");
      const nextLabels = await ViaLabelIndex.create(
        value.vias,
        controller.signal,
      );
      progress?.("构建走线标注索引");
      const nextTracks = await TrackLabelIndex.create(
        value.segments,
        value.nets,
        this.resources.labels.font,
        controller.signal,
      );
      progress?.("构建焊盘与铜皮标注索引");
      const nextAreas = await AreaLabelIndex.create(
        value,
        this.resources.labels.font,
        controller.signal,
      );
      progress?.("上传板图");
      const nextBatches = await this.uploader.uploadAsync(
        value,
        controller.signal,
        {
          kind: "scene",
          colorMode: this.colorMode,
        },
      );
      if (controller.signal.aborted) {
        this.uploader.destroy(nextBatches);
        controller.signal.throwIfAborted();
      }
      this.scene = value;
      this.viaLabelIndex = nextLabels;
      this.trackLabelIndex = nextTracks;
      this.areaLabelIndex = nextAreas;
      this.zoneById = new Map(value.zones.map((z) => [z.id, z]));
      this.index = nextIndex;
      this.batches = BoardDisplay.orderBatches(nextBatches, this.display);
      this.uploader.indexZoneBatches(this.batches);
      this.fit();
      progress?.("等待首帧");
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      controller.signal.throwIfAborted();
      await this.resources.device.queue.onSubmittedWorkDone();
      controller.signal.throwIfAborted();
    } catch (error) {
      if (this.pendingScene === controller) this.clearScene();
      throw error;
    } finally {
      signal.removeEventListener("abort", abort);
      if (this.pendingScene === controller) this.pendingScene = null;
    }
  }

  setDisplay(value: DisplayOptions) {
    if (
      value.activeLayer !== this.display.activeLayer ||
      value.priorities !== this.display.priorities
    )
      this.batches = BoardDisplay.orderBatches(this.batches, value);
    this.display = value;
    this.setHover(null);
    this.invalidate();
  }

  setColorMode(mode: ColorMode) {
    if (this.colorMode === mode) return;
    this.colorMode = mode;
    this.pendingColor?.abort();
    this.pendingColor = null;
    const source = this.scene;
    if (!source) return;
    const job = new AbortController();
    this.pendingColor = job;
    void (async () => {
      let next: GpuBatch[] = [];
      try {
        next = await this.uploader.uploadAsync(source, job.signal, {
          kind: "scene",
          colorMode: mode,
        });
        job.signal.throwIfAborted();
        if (this.scene !== source || this.disposed) return;
        const selected = this.selection;
        this.clearSelected();
        this.setHover(null);
        this.uploader.destroy(this.batches);
        this.batches = BoardDisplay.orderBatches(next, this.display);
        next = [];
        this.uploader.indexZoneBatches(this.batches);
        this.invalidate();
        if (selected) void this.startSelection(selected);
      } catch (error) {
        if (!job.signal.aborted && this.pendingColor === job)
          this.resources.onError(
            error instanceof Error ? error.message : String(error),
          );
      } finally {
        this.uploader.destroy(next);
        if (this.pendingColor === job) this.pendingColor = null;
      }
    })();
  }

  setInteraction(value: { filter: PickFilter; mode: SelectionMode }) {
    const changed = value.mode !== this.interaction.mode,
      anchor =
        this.pendingSelection?.requested?.anchor ?? this.selection?.anchor;
    this.interaction = value;
    this.setHover(null);
    if (changed) {
      if (anchor) this.select(anchor);
      else if (this.pendingSelection) this.clearSelected();
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
      return this.startSelection(first.value.selection);
    }
    return this.startSelection(null, lookup);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.viewListeners.clear();
    this.pendingHover?.abort();
    this.pendingHover = null;
    this.hoverMembers = null;
    this.hideTooltip();
    this.tooltipListeners.clear();
    window.removeEventListener("blur", this.blur);
    this.pendingSelection?.controller.abort();
    this.pendingSelection = null;
    this.pendingScene?.abort();
    this.pendingScene = null;
    this.uploader.zoneBatches.clear();
    this.uploader.zoneOutlines.clear();
    this.scene = null;
    this.index = null;
    this.viaLabelIndex = null;
    this.trackLabelIndex = null;
    this.areaLabelIndex = null;
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
    this.uploader.destroy(this.batches);
    this.uploader.destroy(this.selectionBatches);
    this.uploader.destroy(this.hoverBatches);
    this.zoneById.clear();
    this.disposables.dispose();
  }
}
