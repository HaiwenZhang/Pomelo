/** Main-thread scheduling only. Call at bounded work checkpoints, not per vertex. */
export function cooperative(
  signal?: AbortSignal,
  budgetMs = 8,
  timerIntervalMs = 50,
) {
  let deadline = performance.now() + budgetMs,
    lastTimerYield = performance.now();
  const scheduler = (
    globalThis as typeof globalThis & {
      scheduler?: { yield?: () => Promise<void> };
    }
  ).scheduler;
  return () => {
    signal?.throwIfAborted();
    if (performance.now() < deadline) return;
    // Native yielding avoids repeated timer clamping. Still allow ordinary timer
    // tasks regularly, so cancellation/progress callbacks cannot be starved.
    const native =
      typeof scheduler?.yield === "function" &&
      performance.now() - lastTimerYield < timerIntervalMs;
    if (!native) lastTimerYield = performance.now();
    const continuation = native
      ? scheduler!.yield!()
      : new Promise<void>((resolve) => setTimeout(resolve, 0));
    return continuation.then(() => {
      signal?.throwIfAborted();
      deadline = performance.now() + budgetMs;
    });
  };
}
