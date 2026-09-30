import { runCleanup, type IDisposable } from "../disposable";

let nextIdentity = 1;
/** Owns allocations; draw ranges merely reference this identity. Destruction
 * invalidates every range/cache subscriber, independent of array sorting. */
export class GpuGeometry implements IDisposable {
  readonly identity = nextIdentity++;
  private listeners = new Set<() => void>();
  private destroyed = false;

  constructor(private readonly buffers: readonly GPUBuffer[]) {}

  get alive() {
    return !this.destroyed;
  }
  onDispose(listener: () => void) {
    if (this.destroyed) {
      listener();
      return () => {};
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  dispose() {
    if (this.destroyed) return;
    this.destroyed = true;
    // Notify first so no command cache can retain a replayable dead buffer.
    try {
      runCleanup(
        [
          ...this.listeners,
          ...this.buffers.map((buffer) => () => buffer.destroy()),
        ],
        "GPU geometry disposal failed",
      );
    } finally {
      this.listeners.clear();
    }
  }
}
