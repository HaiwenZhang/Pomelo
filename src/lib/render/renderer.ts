import type { BoardScene, Point } from "../board/model";

import type { SearchItem } from "../board/search";
import type { DisplayOptions } from "../board/display";
import type {
  PickFilter,
  Selection,
  SelectionMode,
} from "../interaction/picking";
import type { IDisposable } from "../disposable";
import type { ViewportInsets } from "../interaction/camera";
import type { ColorMode } from "./color-mode";

export type NavigationTool = "select" | "pan";
export interface ViewState {
  zoom: number;
  pixelsPerMm: number;
}

export interface SelectionTaskState {
  phase: string;
  error?: string;
}

export interface HoverTooltip {
  point: Point;
  lines: readonly string[];
}

/** The viewer-facing rendering contract shared by graphics backends. */
export abstract class Renderer implements IDisposable {
  protected disposed = false;

  protected constructor(readonly canvas: HTMLCanvasElement) {}

  get isDisposed(): boolean {
    return this.disposed;
  }

  abstract setScene(scene: BoardScene | null): void;
  abstract prepareScene(
    scene: BoardScene,
    signal: AbortSignal,
    progress?: (phase: string) => void,
  ): Promise<void>;
  abstract setDisplay(options: DisplayOptions): void;
  abstract setColorMode(mode: ColorMode): void;
  abstract setInteraction(options: {
    filter: PickFilter;
    mode: SelectionMode;
  }): void;
  abstract setNavigationTool(tool: NavigationTool): void;
  abstract setViewportInsets(insets: ViewportInsets): void;
  abstract subscribeView(listener: () => void): () => void;
  abstract getView(): ViewState;
  abstract getBoardPoint(clientX: number, clientY: number): Point | null;
  abstract getTooltip(): HoverTooltip | null;
  abstract subscribeTooltip(listener: () => void): () => void;
  abstract clearSelection(): void;
  abstract fit(): void;
  abstract zoom(factor: number): void;
  abstract setFlipped(value: boolean): void;
  abstract locate(item: SearchItem): Promise<void>;
  abstract dispose(): void;
}
