import { cooperative } from "../../cooperative";
import type { PadsCopperFill } from "./copper";
import { PadsCopperMeshBuilder, type PadsCopperMesh } from "./copper-mesh";
import {
  PadsCopperWorkerPool,
  PadsCopperWorkerUnavailableError,
} from "./copper-workers";

/** Choose parallel construction for substantial browser imports. Small files and
 * runtimes without workers retain the same serial geometry implementation. */
export class PadsCopperBatch {
  constructor(private readonly fills: PadsCopperFill[]) {}

  async build(
    signal?: AbortSignal,
    progress?: (completed: number) => void,
  ): Promise<PadsCopperMesh[][]> {
    signal?.throwIfAborted();
    const work = this.fills.reduce(
      (sum, fill) =>
        sum +
        fill.outer.path.length +
        fill.holes.reduce((count, hole) => count + hole.path.length, 0) +
        fill.thermals.length,
      0,
    );
    if (typeof Worker !== "undefined" && work >= 512) {
      const concurrency = Math.min(
        4,
        Math.max(1, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1),
      );
      try {
        return await new PadsCopperWorkerPool(
          () =>
            new Worker(new URL("./copper.worker.ts", import.meta.url), {
              type: "module",
              name: "pads-copper",
            }),
          concurrency,
        ).build(this.fills, signal, progress);
      } catch (error) {
        signal?.throwIfAborted();
        if (!(error instanceof PadsCopperWorkerUnavailableError)) throw error;
        // CSP, worker startup or loading failure: dispose the whole pool before
        // retrying locally. Never swallow a geometry error returned by a worker.
      }
    }
    const result: PadsCopperMesh[][] = [],
      pause = cooperative(signal);
    for (const fill of this.fills) {
      const pending = pause();
      if (pending) await pending;
      result.push(await new PadsCopperMeshBuilder(fill).build(signal));
      progress?.(result.length);
    }
    signal?.throwIfAborted();
    return result;
  }
}
