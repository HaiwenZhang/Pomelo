import { createStore } from "zustand/vanilla";
import type { BrdTextEncoding } from "./allegro/binary/text-decoder";
import { BoardDisplay, type DisplayOptions } from "./board/display";
import type { BoardScene } from "./board/model";
import type { SearchItem } from "./board/search";
import { loadBoard } from "./import/load-board";
import type { BoardFile, BoardLoader, BoardSource } from "./import/model";
import type {
  PickFilter,
  Selection,
  SelectionMode,
} from "./interaction/picking";
import type { ProgressReporter } from "./progress";
import type { SelectionTaskState } from "./render/renderer";
import type { ColorMode } from "./render/color-mode";
import { visibleError, type VisibleError } from "./parser-error";
import { LatestTask } from "./latest-task";

type Update<T> = T | ((previous: T) => T);
export interface ScenePresentation {
  clear: () => void;
  prepare: (
    scene: BoardScene,
    signal: AbortSignal,
    progress: ProgressReporter,
  ) => Promise<void>;
}
export interface ViewerState {
  scene: BoardScene | null;
  searchItems: SearchItem[];
  file: BoardFile | null;
  display: DisplayOptions;
  colorMode: ColorMode;
  flipped: boolean;
  selection: Selection | null;
  selectionTask: SelectionTaskState | null;
  pickFilter: PickFilter;
  selectionMode: SelectionMode;
  phase: string;
  progress: number | null;
  error: VisibleError;
  gpu: string;
  gpuError: string;
  setDisplay: (value: Update<DisplayOptions>) => void;
  setColorMode: (mode: ColorMode) => void;
  setFlipped: (value: Update<boolean>) => void;
  setSelection: (value: Selection | null) => void;
  setSelectionTask: (value: SelectionTaskState | null) => void;
  setPickFilter: (value: PickFilter) => void;
  setSelectionMode: (value: SelectionMode) => void;
  setGpu: (value: string) => void;
  setGpuError: (value: string) => void;
  setError: (value: VisibleError) => void;
  open: (
    source?: BoardSource,
    presentation?: ScenePresentation,
    encoding?: BrdTextEncoding,
  ) => Promise<void>;
  cancel: () => void;
}
/** Board objects retain identity. GPU resources and per-frame camera state stay outside React. */
export function createViewerStore(load: BoardLoader = loadBoard) {
  const tasks = new LatestTask();
  return createStore<ViewerState>()((set) => ({
    scene: null,
    searchItems: [],
    file: null,
    display: BoardDisplay.createDisplayOptions(),
    colorMode: "net",
    flipped: false,
    selection: null,
    selectionTask: null,
    pickFilter: "all",
    selectionMode: "object",
    phase: "读取文件",
    progress: null,
    error: "",
    gpu: "初始化",
    gpuError: "",
    setDisplay: (value) =>
      set((s) => ({
        display: typeof value === "function" ? value(s.display) : value,
      })),
    setColorMode: (colorMode) => set({ colorMode }),
    setFlipped: (value) =>
      set((s) => ({
        flipped: typeof value === "function" ? value(s.flipped) : value,
      })),
    setSelection: (selection) => set({ selection }),
    setSelectionTask: (selectionTask) => set({ selectionTask }),
    setPickFilter: (pickFilter) => set({ pickFilter }),
    setSelectionMode: (selectionMode) => set({ selectionMode }),
    setGpu: (gpu) => set({ gpu }),
    setGpuError: (gpuError) => set({ gpuError }),
    setError: (error) => set({ error }),
    cancel: () => {
      tasks.cancel();
      set({ progress: null, phase: "已取消" });
    },
    open: async (source, presentation, encoding = "utf-8") => {
      if (!source) return;
      const task = tasks.start(),
        controller = task.controller;
      const current = () => task.isCurrent && !task.signal.aborted;
      set({
        scene: null,
        searchItems: [],
        file: null,
        selection: null,
        selectionTask: null,
        colorMode: "net",
        flipped: false,
        error: "",
        phase: "读取文件",
        progress: 0,
      });
      try {
        presentation?.clear();
        const report: ProgressReporter = ({ phase, fraction }) => {
          if (current())
            set({
              phase,
              ...(fraction === undefined ? {} : { progress: fraction }),
            });
        };
        const { scene, searchItems, file } = await load(
          source,
          controller.signal,
          report,
          encoding,
        );
        task.assertCurrent();
        if (presentation) {
          await presentation.prepare(scene, controller.signal, report);
          task.assertCurrent();
        }
        if (current())
          set({
            scene,
            searchItems,
            display: BoardDisplay.createDisplayOptions(scene.drawingLayers),
            file,
          });
      } catch (error) {
        if (current())
          set({
            error: visibleError(error),
          });
      } finally {
        if (task.isCurrent) {
          set({ progress: null });
        }
        task.finish();
      }
    },
  }));
}
export const viewerStore = createViewerStore();
