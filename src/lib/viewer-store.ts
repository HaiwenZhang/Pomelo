import { createStore } from "zustand/vanilla";
import type { BrdHeader } from "./allegro/binary/header";
import type { BrdTextEncoding } from "./allegro/binary/text-decoder";
import type { BrdDatabase } from "./allegro/database";
import { AllegroParser, type ParseProgress } from "./allegro/parser";
import { AllegroSceneBuilder } from "./allegro/scene-builder";

import { BoardDisplay } from "./board/display";
import type { BoardScene } from "./board/model";
import { BoardSearchIndex } from "./board/search";

import type { AltiumInfo } from "./altium/import";
import { type DisplayOptions } from "./board/display";
import { type SearchItem } from "./board/search";
import type { HfssInfo } from "./hfss/import";
import type {
  PickFilter,
  Selection,
  SelectionMode,
} from "./interaction/picking";
import type { KiCadInfo } from "./kicad/import";
import { importOdb, type OdbInfo } from "./odb/import";
import type { PadsInfo } from "./pads/import";
import { BoardTextStrokeBuilder } from "./text/board-text-stroke-builder";
import { StrokeFont } from "./text/stroke-font";
import type { SelectionTaskState } from "./render/renderer";
import type { ColorMode } from "./render/color-mode";

type Update<T> = T | ((previous: T) => T);
export interface ScenePresentation {
  clear: () => void;
  prepare: (
    scene: BoardScene,
    signal: AbortSignal,
    progress: (phase: string) => void,
  ) => Promise<void>;
}
interface BoardFileBase {
  name: string;
  size: number;
  records: number;
  encoding: BrdTextEncoding;
}
type BoardFileFormat =
  | { format?: "brd"; header: BrdHeader }
  | { format: "odb"; odb: OdbInfo }
  | { format: "hfss"; hfss: HfssInfo }
  | { format: "pads"; pads: PadsInfo }
  | { format: "kicad"; kicad: KiCadInfo }
  | { format: "altium"; altium: AltiumInfo };

export type BoardFile = BoardFileBase & BoardFileFormat;
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
  error: string;
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
  setError: (value: string) => void;
  open: (
    source?: Pick<File, "name" | "size" | "arrayBuffer">,
    presentation?: ScenePresentation,
    encoding?: BrdTextEncoding,
  ) => Promise<void>;
  cancel: () => void;
}
/** Board objects retain identity. GPU resources and per-frame camera state stay outside React. */
export function createViewerStore(
  dependencies = {
    parseBrd: (
      buffer: ArrayBuffer,
      signal?: AbortSignal,
      progress?: (value: ParseProgress) => void,
      encoding?: BrdTextEncoding,
    ) => new AllegroParser(buffer, encoding).parse(signal, progress),
    buildScene: (
      database: BrdDatabase,
      signal?: AbortSignal,
      progress?: (phase: string) => void,
    ) => new AllegroSceneBuilder(database).build(signal, progress),
  },
) {
  let task: AbortController | null = null;
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
      task?.abort();
      task = null;
      set({ progress: null, phase: "已取消" });
    },
    open: async (source, presentation, encoding = "utf-8") => {
      if (!source) return;
      task?.abort();
      const controller = new AbortController();
      task = controller;
      const current = () => task === controller && !controller.signal.aborted;
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
        const buffer = await source.arrayBuffer();
        controller.signal.throwIfAborted();
        let scene: BoardScene,
          metadata: Pick<BoardFileBase, "records"> &
            (
              | { format: "brd"; header: BrdHeader }
              | { format: "odb"; odb: OdbInfo }
              | { format: "hfss"; hfss: HfssInfo }
              | { format: "pads"; pads: PadsInfo }
              | { format: "kicad"; kicad: KiCadInfo }
              | { format: "altium"; altium: AltiumInfo }
            );
        if (/\.(?:tgz|tar|tar\.gz)$/i.test(source.name)) {
          const loaded = await importOdb(buffer, controller.signal, (phase) => {
            if (current()) set({ phase, progress: 0.4 });
          });
          scene = loaded.scene;
          metadata = {
            format: "odb",
            odb: loaded.info,
            records: loaded.info.features,
          };
        } else if (/\.def$/i.test(source.name)) {
          const { importHfss } = await import("./hfss/import");
          controller.signal.throwIfAborted();
          const loaded = await importHfss(
            buffer,
            controller.signal,
            (phase) => {
              if (current()) set({ phase, progress: 0.4 });
            },
          );
          scene = loaded.scene;
          metadata = {
            format: "hfss",
            hfss: loaded.info,
            records: loaded.info.sourcePrimitives + loaded.info.padstacks,
          };
        } else if (/\.pcbdoc$/i.test(source.name)) {
          const { importAltium } = await import("./altium/import");
          controller.signal.throwIfAborted();
          const loaded = await importAltium(
            buffer,
            controller.signal,
            (phase) => {
              if (current()) set({ phase, progress: 0.4 });
            },
          );
          scene = loaded.scene;
          metadata = {
            format: "altium",
            altium: loaded.info,
            records: loaded.info.sourceObjects,
          };
        } else if (/\.kicad_pcb$/i.test(source.name)) {
          const { importKiCad } = await import("./kicad/import");
          controller.signal.throwIfAborted();
          const loaded = await importKiCad(
            buffer,
            controller.signal,
            (phase) => {
              if (current()) set({ phase, progress: 0.4 });
            },
          );
          scene = loaded.scene;
          metadata = {
            format: "kicad",
            kicad: loaded.info,
            records: loaded.info.sourceObjects,
          };
        } else if (/\.pcb$/i.test(source.name)) {
          const { importPads } = await import("./pads/import");
          controller.signal.throwIfAborted();
          const loaded = await importPads(
            buffer,
            controller.signal,
            (phase) => {
              if (current()) set({ phase, progress: 0.4 });
            },
          );
          scene = loaded.scene;
          metadata = {
            format: "pads",
            pads: loaded.info,
            records:
              loaded.info.sourcePins +
              loaded.info.sourceVias +
              loaded.info.sourceRoutes,
          };
        } else {
          const db = await dependencies.parseBrd(
            buffer,
            controller.signal,
            (p) => {
              if (current())
                set({
                  phase:
                    p.phase === "strings"
                      ? "读取字符串表"
                      : `解析对象 · ${p.count.toLocaleString()}`,
                  progress: 0.05 + p.fraction * 0.45,
                });
            },
            encoding,
          );
          controller.signal.throwIfAborted();
          if (current()) set({ phase: "构建几何", progress: 0.5 });
          scene = await dependencies.buildScene(
            db,
            controller.signal,
            (phase) => {
              if (current()) set({ phase });
            },
          );
          controller.signal.throwIfAborted();
          if (db.textDecoder.issues.size) {
            const offsets = [...db.textDecoder.issues.keys()]
              .slice(0, 8)
              .map((n) => `0x${n.toString(16)}`)
              .join(", ");
            scene.diagnostics.push(
              `字符编码 ${encoding} 无法完整解读 ${db.textDecoder.issues.size} 处内容（偏移 ${offsets}）；可在文件信息中选择编码后重新读取。原始字节保留。`,
            );
          }
          metadata = { format: "brd", header: db.header, records: db.count };
        }
        if (current()) set({ phase: "读取原始文字字形" });
        await StrokeFont.prepare(scene.texts, controller.signal);
        const missing = new Set<string>();
        for (const t of scene.texts)
          for (const ch of t.text)
            if (!BoardTextStrokeBuilder.supportsGlyph(ch)) missing.add(ch);
        if (missing.size)
          scene.diagnostics.push(
            `原始文字缺少 ${missing.size} 种字形，暂用 ? 显示：${[...missing].slice(0, 16).join(" ")}`,
          );
        if (current()) set({ phase: "构建搜索索引", progress: 0.7 });
        const searchItems = await BoardSearchIndex.buildItemsAsync(
          scene,
          controller.signal,
        );
        controller.signal.throwIfAborted();
        if (presentation) {
          await presentation.prepare(scene, controller.signal, (phase) => {
            if (current())
              set({
                phase,
                progress:
                  phase === "构建拾取索引"
                    ? 0.75
                    : phase === "等待首帧"
                      ? 0.95
                      : 0.85,
              });
          });
          controller.signal.throwIfAborted();
        }
        if (current())
          set({
            scene,
            searchItems,
            display: BoardDisplay.createDisplayOptions(scene.drawingLayers),
            file: {
              name: source.name,
              size: source.size,
              ...metadata,
              encoding,
            },
          });
      } catch (error) {
        if (current())
          set({
            error: error instanceof Error ? error.message : String(error),
          });
      } finally {
        if (task === controller) {
          task = null;
          set({ progress: null });
        }
      }
    },
  }));
}
export const viewerStore = createViewerStore();
