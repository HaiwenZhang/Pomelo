export interface TaskTicket {
  readonly generation: number;
  readonly controller: AbortController;
  readonly signal: AbortSignal;
  readonly isCurrent: boolean;
  assertCurrent(): void;
  finish(): void;
}

/** One publishing task per scope. Cancel cooperatively and reject stale results
 * even when a dependency ignores abort. Parent listeners are always detached. */
export class LatestTask {
  private generation = 0;
  private current?: TaskTicket;
  private detach?: () => void;
  private disposed = false;

  start(parent?: AbortSignal): TaskTicket {
    if (this.disposed) throw new Error("Task scope disposed");
    this.cancel();
    parent?.throwIfAborted();
    const scope = this,
      controller = new AbortController(),
      generation = ++this.generation;
    const task: TaskTicket = {
      generation,
      controller,
      signal: controller.signal,
      get isCurrent() {
        return scope.current === task;
      },
      assertCurrent() {
        controller.signal.throwIfAborted();
        if (scope.current !== task)
          throw new DOMException("Stale task result", "AbortError");
      },
      finish() {
        if (scope.current === task) {
          scope.detach?.();
          scope.detach = undefined;
          scope.current = undefined;
        }
      },
    };
    this.current = task;
    if (parent) {
      const abort = () => controller.abort(parent.reason);
      parent.addEventListener("abort", abort, { once: true });
      this.detach = () => parent.removeEventListener("abort", abort);
    }
    return task;
  }
  cancel() {
    const current = this.current;
    this.current = undefined;
    this.detach?.();
    this.detach = undefined;
    current?.controller.abort();
  }
  dispose() {
    this.disposed = true;
    this.cancel();
  }
}
