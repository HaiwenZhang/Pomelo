import type { Bounds, Point } from "../board/model";
import { Camera, type ViewportInsets } from "./camera";
import { canvasBoardPoint } from "./cursor-coordinate";
import type { ViewState } from "./model";

/** Camera navigation and view snapshots for one canvas, independent of its graphics backend. */
export class BoardViewport {
  readonly camera = new Camera();
  private insets: ViewportInsets = { left: 0, right: 0, top: 0, bottom: 0 };
  private fitScale = 10;
  private view: ViewState = { zoom: 100, pixelsPerMm: 10 };
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly bounds: () => Bounds | null,
    private readonly invalidate: () => void,
  ) {}

  readonly getView = () => this.view;
  readonly subscribeView = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  publishView(): void {
    const zoom = (this.camera.scale / this.fitScale) * 100;
    if (this.view.zoom === zoom && this.view.pixelsPerMm === this.camera.scale)
      return;
    this.view = { zoom, pixelsPerMm: this.camera.scale };
    this.listeners.forEach((listener) => listener());
  }

  getBoardPoint(clientX: number, clientY: number): Point | null {
    return canvasBoardPoint(
      this.camera,
      this.bounds(),
      this.canvas.getBoundingClientRect(),
      clientX,
      clientY,
    );
  }

  worldPoint(clientX: number, clientY: number): Point | null {
    const bounds = this.bounds();
    if (!bounds) return null;
    const rect = this.canvas.getBoundingClientRect();
    return this.camera.worldPoint(
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
      bounds,
    );
  }

  setInsets(insets: ViewportInsets): void {
    this.insets = insets;
  }

  fit(): void {
    const bounds = this.bounds();
    if (!bounds) return;
    const rect = this.canvas.getBoundingClientRect();
    this.camera.fit(bounds, rect.width, rect.height, this.insets);
    this.fitScale = this.camera.scale;
    this.invalidate();
  }

  focusBounds(bounds: Bounds, source: Bounds): void {
    const rect = this.canvas.getBoundingClientRect();
    const { camera, insets } = this;
    camera.x = (bounds.minX + bounds.maxX - source.minX - source.maxX) / 2;
    camera.y = (bounds.minY + bounds.maxY - source.minY - source.maxY) / 2;
    camera.scale =
      Math.min(
        400,
        Math.max(1, rect.width - insets.left - insets.right) /
          Math.max(3, bounds.maxX - bounds.minX),
        Math.max(1, rect.height - insets.top - insets.bottom) /
          Math.max(3, bounds.maxY - bounds.minY),
      ) * 0.72;
    camera.x +=
      ((insets.right - insets.left) / (2 * camera.scale)) *
      camera.horizontalSign;
    camera.y += (insets.top - insets.bottom) / (2 * camera.scale);
    this.invalidate();
  }

  zoom(factor: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.zoom(
      factor,
      (rect.width + this.insets.left - this.insets.right) / 2,
      (rect.height + this.insets.top - this.insets.bottom) / 2,
      rect.width,
      rect.height,
    );
    this.invalidate();
  }

  zoomAt(factor: number, clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    this.camera.zoom(
      factor,
      clientX - rect.left,
      clientY - rect.top,
      rect.width,
      rect.height,
    );
    this.invalidate();
  }

  pan(dx: number, dy: number): void {
    this.camera.pan(dx, dy);
    this.invalidate();
  }

  setFlipped(value: boolean): void {
    this.camera.flipped = value;
    this.invalidate();
  }

  dispose(): void {
    this.listeners.clear();
  }
}
