import type { SceneBuildEvent } from "../board/model";
import { cooperative } from "../cooperative";

/** Progress and cancellation state is private to one build, including retries. */
export class AllegroBuildProgress {
  private stage = "";
  private stageStart = performance.now();
  private readonly pauseIfNeeded: ReturnType<typeof cooperative>;

  constructor(
    private readonly signal?: AbortSignal,
    private readonly progress?: (label: string) => void,
    private readonly trace?: (event: SceneBuildEvent) => void,
  ) {
    this.pauseIfNeeded = cooperative(signal, 10);
  }

  begin(next: string): void {
    const now = performance.now();
    if (this.stage)
      this.trace?.({
        stage: this.stage,
        event: "end",
        ms: now - this.stageStart,
      });
    this.stage = next;
    this.stageStart = now;
    this.trace?.({ stage: next, event: "start" });
    this.progress?.(next);
    this.signal?.throwIfAborted();
  }

  checkpoint(): Promise<void> | undefined {
    const pause = this.pauseIfNeeded();
    if (pause) {
      this.progress?.(this.stage);
      return pause;
    }
  }

  finish(): void {
    this.trace?.({
      stage: this.stage,
      event: "end",
      ms: performance.now() - this.stageStart,
    });
  }
}
