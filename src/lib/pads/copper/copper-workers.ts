import type { PadsCopperFill } from "./copper";
import type {
  PadsCopperJob,
  PadsCopperMesh,
  PadsCopperReply,
} from "./copper-mesh";

export interface PadsCopperWorker {
  onmessage: ((event: MessageEvent<PadsCopperReply>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(job: PadsCopperJob): void;
  terminate(): void;
}

/** Infrastructure failure can use the serial path; invalid copper must still fail. */
export class PadsCopperWorkerUnavailableError extends Error {}

/** Bounded, import-scoped workers. Results retain source order, regardless of
 * completion order. Termination also interrupts synchronous clipping on abort. */
export class PadsCopperWorkerPool {
  constructor(
    private readonly createWorker: () => PadsCopperWorker,
    private readonly concurrency: number,
  ) {}

  async build(
    fills: PadsCopperFill[],
    signal?: AbortSignal,
    progress?: (completed: number) => void,
  ): Promise<PadsCopperMesh[][]> {
    signal?.throwIfAborted();
    if (!fills.length) return [];
    if (!Number.isSafeInteger(this.concurrency) || this.concurrency < 1)
      throw new RangeError("Invalid worker concurrency");
    // Large contours go first so a late, expensive plane cannot leave the rest
    // of the pool idle. This changes scheduling only, never geometry or zone IDs.
    const queue = fills.map((fill, index) => ({
      index,
      weight:
        fill.outer.path.length +
        fill.holes.reduce((sum, hole) => sum + hole.path.length, 0) +
        fill.thermals.length,
    }));
    queue.sort((a, b) => b.weight - a.weight || a.index - b.index);

    return new Promise((resolve, reject) => {
      const workers: PadsCopperWorker[] = [],
        results: PadsCopperMesh[][] = new Array(fills.length);
      let next = 0,
        completed = 0,
        settled = false;
      const dispose = () => {
        signal?.removeEventListener("abort", abort);
        for (const worker of workers) {
          worker.onmessage = null;
          worker.onerror = null;
          worker.onmessageerror = null;
          worker.terminate();
        }
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        dispose();
        reject(error);
      };
      const unavailable = (error: unknown) =>
        fail(
          new PadsCopperWorkerUnavailableError(
            error instanceof Error ? error.message : String(error),
            { cause: error },
          ),
        );
      const abort = () => fail(signal!.reason);
      const dispatch = (worker: PadsCopperWorker) => {
        if (settled || next === queue.length) return;
        const { index } = queue[next++];
        worker.onmessage = ({ data }) => {
          if (settled) return;
          if (data.index !== index) {
            unavailable(new Error("Unexpected PADS copper worker response"));
            return;
          }
          if (data.type === "error") {
            const error = new Error(data.error.message);
            error.name = data.error.name;
            fail(error);
            return;
          }
          worker.onmessage = null;
          results[index] = data.meshes;
          completed++;
          try {
            progress?.(completed);
            if (settled) return; // A progress consumer may cancel the import.
            if (completed === fills.length) {
              settled = true;
              dispose();
              resolve(results);
            } else {
              dispatch(worker);
            }
          } catch (error) {
            fail(error);
          }
        };
        try {
          worker.postMessage({ index, fill: fills[index] });
        } catch (error) {
          unavailable(error);
        }
      };
      signal?.addEventListener("abort", abort, { once: true });
      try {
        for (
          let i = 0;
          i < Math.min(this.concurrency, fills.length) && !settled;
          i++
        ) {
          const worker = this.createWorker();
          workers.push(worker);
          worker.onerror = (event) => {
            event.preventDefault();
            unavailable(new Error(event.message));
          };
          worker.onmessageerror = () =>
            unavailable(
              new Error("PADS copper worker message could not be read"),
            );
          dispatch(worker);
        }
      } catch (error) {
        unavailable(error);
      }
    });
  }
}
