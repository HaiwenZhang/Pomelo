import { cooperative } from "./cooperative";

/** Synchronous completion of the same bounded traversal used by cooperative callers. */
export function completeSteps<T>(steps: Generator<void, T>): T {
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}

/** Close paused generators on failure or cancellation, including their owned resources. */
export async function completeStepsAsync<T>(
  steps: Generator<void, T>,
  signal?: AbortSignal,
  budgetMs = 8,
  timerIntervalMs = 50,
): Promise<T> {
  const checkpoint = cooperative(signal, budgetMs, timerIntervalMs);
  try {
    while (true) {
      signal?.throwIfAborted();
      const step = steps.next();
      if (step.done) {
        signal?.throwIfAborted();
        return step.value;
      }
      const pause = checkpoint();
      if (pause) await pause;
    }
  } finally {
    steps.return(undefined as T);
  }
}
