import type { Point } from "../board/model";

export type NavigationTool = "select" | "pan";

export interface ViewState {
  zoom: number;
  pixelsPerMm: number;
}

export interface HoverTooltip {
  point: Point;
  lines: readonly string[];
}
