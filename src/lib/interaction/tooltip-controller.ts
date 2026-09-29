import type { BoardScene, Point } from "../board/model";
import { LatestTask, type TaskTicket } from "../latest-task";
import { hoverDetails } from "./hover-details";
import type { HoverTooltip } from "./model";
import type { BoardIndex, PickHit, SelectionMode } from "./picking";

interface TooltipContext {
  scene: BoardScene;
  index: BoardIndex;
  mode: SelectionMode;
}

interface TooltipHost {
  context(): TooltipContext | null;
  onError(message: string): void;
}

/** Owns delayed hover details and rejects results from superseded scenes or pointers. */
export class TooltipController {
  private readonly tasks = new LatestTask();
  private readonly listeners = new Set<() => void>();
  private tooltip: HoverTooltip | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private job: TaskTicket | null = null;
  private disposed = false;

  constructor(
    private readonly host: TooltipHost,
    private readonly details: typeof hoverDetails = hoverDetails,
  ) {}

  readonly getTooltip = () => this.tooltip;
  readonly subscribeTooltip = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(value: HoverTooltip | null): void {
    if (this.tooltip === value) return;
    this.tooltip = value;
    this.listeners.forEach((listener) => listener());
  }

  hide(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.tasks.cancel();
    this.job = null;
    this.publish(null);
  }

  schedule(hit: PickHit | null, point: Point): void {
    this.hide();
    const context = this.host.context();
    if (this.disposed || !hit || !context) return;
    const job = this.tasks.start();
    this.job = job;
    const current = () =>
      !job.signal.aborted &&
      !this.disposed &&
      this.job === job &&
      this.host.context()?.scene === context.scene;
    this.timer = setTimeout(async () => {
      this.timer = undefined;
      try {
        const lines = await this.details(
          context.scene,
          context.index,
          hit,
          context.mode,
          job.signal,
        );
        if (current()) this.publish({ lines, point });
      } catch (error) {
        if (current()) {
          this.publish(null);
          this.host.onError(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        job.finish();
        if (this.job === job) this.job = null;
      }
    }, 350);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.hide();
    this.listeners.clear();
    this.tasks.dispose();
  }
}
