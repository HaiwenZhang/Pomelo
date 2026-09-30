/** Abort the wait promptly while observing the original promise's eventual rejection. */
export function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", abort);
      action();
    };
    const abort = () => finish(() => reject(signal.reason));
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

/** A hidden tab may suspend RAF indefinitely; cancellation must still complete. */
export async function nextFrame(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  let frame = 0;
  try {
    await withAbort(
      new Promise<void>((resolve) => {
        frame = requestAnimationFrame(() => resolve());
      }),
      signal,
    );
  } finally {
    cancelAnimationFrame(frame);
  }
}
