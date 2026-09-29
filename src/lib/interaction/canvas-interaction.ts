import type { Point } from "../board/model";
import type { BoardViewport } from "./board-viewport";
import type { NavigationTool } from "./model";
import type { PickHit } from "./picking";

interface CanvasInteractionHost {
  pick(clientX: number, clientY: number): PickHit | null;
  hover(hit: PickHit | null): void;
  select(hit: PickHit | null): void;
  scheduleTooltip(hit: PickHit | null, point: Point): void;
  hideTooltip(): void;
  fit(): void;
  resize(): void;
}

/** Owns DOM subscriptions, pointer capture and navigation gestures for one canvas. */
export class CanvasInteractionController {
  private readonly events = new AbortController();
  private readonly observer: ResizeObserver;
  private disposed = false;
  private navigationTool: NavigationTool = "select";
  private pointer: {
    id: number;
    x: number;
    y: number;
    startX: number;
    startY: number;
    button: number;
    dragging: boolean;
  } | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly viewport: BoardViewport,
    private readonly host: CanvasInteractionHost,
  ) {
    const options = { signal: this.events.signal };
    canvas.addEventListener("wheel", this.wheel, {
      ...options,
      passive: false,
    });
    canvas.addEventListener("pointerdown", this.down, options);
    canvas.addEventListener("pointermove", this.move, options);
    canvas.addEventListener("pointerup", this.up, options);
    canvas.addEventListener("pointercancel", this.cancel, options);
    canvas.addEventListener("lostpointercapture", this.cancel, options);
    canvas.addEventListener("pointerleave", this.leave, options);
    window.addEventListener("keydown", this.key, options);
    window.addEventListener("blur", this.blur, options);
    this.observer = new ResizeObserver(() => this.host.resize());
    this.observer.observe(canvas);
  }

  setTool(tool: NavigationTool): void {
    this.navigationTool = tool;
    this.host.hover(null);
    this.cancel();
  }

  setHoverCursor(hit: PickHit | null): void {
    this.canvas.style.cursor = hit
      ? "pointer"
      : this.navigationTool === "pan"
        ? "grab"
        : "default";
  }

  private readonly wheel = (e: WheelEvent) => {
    e.preventDefault();
    this.host.hover(null);
    this.viewport.zoomAt(
      Math.exp(-Math.max(-200, Math.min(200, e.deltaY)) * 0.006),
      e.clientX,
      e.clientY,
    );
  };

  private readonly down = (e: PointerEvent) => {
    if (e.button > 1 || this.pointer) return;
    this.canvas.focus({ preventScroll: true });
    this.pointer = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      button: e.button,
      dragging: e.button === 1 || this.navigationTool === "pan",
    };
    this.host.hover(null);
    this.canvas.setPointerCapture(e.pointerId);
  };

  private readonly move = (e: PointerEvent) => {
    if (!this.pointer) {
      if (this.navigationTool === "pan") return;
      const hit = this.host.pick(e.clientX, e.clientY),
        canvasBounds = this.canvas.getBoundingClientRect();
      this.host.hover(hit);
      this.host.scheduleTooltip(hit, [
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
      this.viewport.pan(e.clientX - this.pointer.x, e.clientY - this.pointer.y);
      this.pointer.x = e.clientX;
      this.pointer.y = e.clientY;
      this.canvas.style.cursor = "grabbing";
    }
  };

  private readonly up = (e: PointerEvent) => {
    if (this.pointer?.id !== e.pointerId) return;
    const click = this.pointer.button === 0 && !this.pointer.dragging;
    this.pointer = null;
    this.canvas.style.cursor =
      this.navigationTool === "pan" ? "grab" : "default";
    if (click) this.host.select(this.host.pick(e.clientX, e.clientY));
    if (this.canvas.hasPointerCapture(e.pointerId))
      this.canvas.releasePointerCapture(e.pointerId);
  };

  readonly cancel = () => {
    const id = this.pointer?.id;
    this.pointer = null;
    if (id !== undefined && this.canvas.hasPointerCapture(id))
      this.canvas.releasePointerCapture(id);
    this.host.hideTooltip();
    this.canvas.style.cursor =
      this.navigationTool === "pan" ? "grab" : "default";
  };

  private readonly leave = () => {
    if (!this.pointer) this.host.hover(null);
  };

  private readonly key = (e: KeyboardEvent) => {
    if (
      e.target instanceof HTMLElement &&
      e.target.closest("input,select,textarea,[contenteditable=true]")
    )
      return;
    if (e.key === "F2") {
      e.preventDefault();
      this.host.hover(null);
      this.host.fit();
    }
    if (e.key === "Escape") {
      this.host.hover(null);
      this.host.select(null);
    }
  };

  private readonly blur = () => this.host.hover(null);

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.events.abort();
    this.observer.disconnect();
    this.cancel();
  }
}
