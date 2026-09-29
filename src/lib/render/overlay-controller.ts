import { LatestTask, type TaskTicket } from "../latest-task";
import { BoardDisplay, type DisplayOptions } from "../board/display";
import type { BoardScene, Bounds } from "../board/model";
import { cooperative } from "../cooperative";
import {
  selectionScene,
  selectionSceneSteps,
  type BoardObject,
  type PickHit,
  type Selection,
  type SelectionMode,
} from "../interaction/picking";
import { GpuBatchSet } from "./gpu-batch-set";
import type { GpuBatch } from "./webgpu-batch-uploader";
import type { GpuScene } from "./gpu-scene";
import type { WebGPUResources } from "./webgpu-resources";

interface OverlayHost {
  scene(): GpuScene | null;
  display(): DisplayOptions;
  mode(): SelectionMode;
  invalidate(): void;
  focusBounds(bounds: Bounds, source: BoardScene): void;
}

/** Selection and hover each own a cancellable task and their new allocations.
 * Scene-owned range views are never disposed as overlay allocations. */
export class OverlayController {
  selection: Selection | null = null;
  hover: PickHit | null = null;
  hoverMembers: BoardObject[] | null = null;
  selectionBatches: GpuBatch[] = [];
  hoverBatches: GpuBatch[] = [];
  pendingSelection: {
    controller: AbortController;
    task: TaskTicket;
    requested: Selection | null;
  } | null = null;
  private pendingHover: TaskTicket | null = null;
  private readonly selectionTasks = new LatestTask();
  private readonly hoverTasks = new LatestTask();
  private selectionPackets = new GpuBatchSet();
  private hoverPackets = new GpuBatchSet();
  private disposed = false;
  constructor(
    private readonly resources: WebGPUResources,
    private readonly host: OverlayHost,
  ) {}
  private get scene() {
    return this.host.scene()?.source ?? null;
  }
  private get index() {
    return this.host.scene()?.index ?? null;
  }
  private get uploader() {
    const scene = this.host.scene();
    if (!scene) throw Error("No GPU scene");
    return scene.uploader;
  }
  private get display() {
    return this.host.display();
  }
  private get interaction() {
    return { mode: this.host.mode() };
  }
  private invalidate() {
    this.host.invalidate();
  }
  private focusBounds(bounds: Bounds, source: BoardScene) {
    this.host.focusBounds(bounds, source);
  }
  clearSelected() {
    this.selectionTasks.cancel();
    this.pendingSelection = null;
    this.selection = null;
    this.selectionPackets.dispose();
    this.selectionPackets = new GpuBatchSet();
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

  startSelection(
    value: Selection | null,
    lookup?: Generator<
      void,
      { selection: Selection | null; bounds: Bounds | null }
    >,
  ) {
    this.clearSelected();
    if (!this.scene || (!value && !lookup)) return Promise.resolve();
    const source = this.scene,
      task = this.selectionTasks.start(),
      job = { controller: task.controller, task, requested: value };
    this.pendingSelection = job;
    const signal = job.controller.signal;
    this.resources.onSelectionTask?.({
      phase: lookup ? "查找对象" : "准备选择",
    });
    return (async () => {
      let owned = new GpuBatchSet();
      try {
        // Let the sidebar paint its cancellation control before expensive work.
        await new Promise((resolve) => setTimeout(resolve, 0));
        task.assertCurrent();
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
        task.assertCurrent();
        this.selectionPackets = owned;
        this.selectionBatches = owned.batches;
        owned = new GpuBatchSet();
        this.selection = value;
        this.resources.onSelection?.(value);
        this.invalidate();
        this.resources.onSelectionTask?.({ phase: "显示选择" });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        task.assertCurrent();
        await this.resources.device.queue.onSubmittedWorkDone();
        task.assertCurrent();
      } catch (error) {
        owned.dispose();
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
        task.finish();
        lookup?.return({ selection: null, bounds: null });
        if (this.pendingSelection === job) {
          this.pendingSelection = null;
          this.resources.onSelectionTask?.(null);
        }
      }
    })();
  }

  select(hit: PickHit | null) {
    return this.startSelection(
      hit && this.index ? this.index.select(hit, this.interaction.mode) : null,
    );
  }

  private async prepareGroupHover(
    source: BoardScene,
    objects: BoardObject[],
    job: TaskTicket,
  ) {
    const renderer = this;
    let owned = new GpuBatchSet();
    const visibility = renderer.display;
    try {
      // Yield out of the pointer handler before walking a large network.
      await new Promise((resolve) => setTimeout(resolve, 0));
      job.assertCurrent();
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
      job.assertCurrent();
      if (
        renderer.disposed ||
        renderer.scene !== source ||
        renderer.pendingHover !== job
      )
        return;
      renderer.hoverBatches = BoardDisplay.orderBatches(
        [...outlines, ...owned.batches],
        renderer.display,
      );
      renderer.hoverPackets = owned;
      owned = new GpuBatchSet();
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
      owned.dispose();
      job.finish();
      if (renderer.pendingHover === job) renderer.pendingHover = null;
    }
  }

  setHover(hit: PickHit | null) {
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
    // Index-owned arrays are stable. Crossing members of the same net must not
    // restart its preparation, upload again or repaint an unchanged overlay.
    if (members && members === this.hoverMembers) return;
    this.hoverTasks.cancel();
    this.pendingHover = null;
    this.hoverMembers = members;
    this.hoverPackets.dispose();
    this.hoverPackets = new GpuBatchSet();
    this.hoverBatches = [];
    if (members && this.scene) {
      const job = this.hoverTasks.start();
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
            }),
          )
        : hit && this.scene
          ? (this.hoverPackets = this.uploader.upload(
              selectionScene(this.scene, [hit.object]),
              {
                kind: "selection",
              },
            )).batches
          : [];
    this.invalidate();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.selectionTasks.cancel();
    this.pendingSelection = null;
    this.hoverTasks.cancel();
    this.pendingHover = null;
    this.selectionTasks.dispose();
    this.hoverTasks.dispose();
    this.selectionPackets.dispose();
    this.hoverPackets.dispose();
    this.selectionBatches = [];
    this.hoverBatches = [];
    this.selection = null;
    this.hover = null;
    this.hoverMembers = null;
  }
}
