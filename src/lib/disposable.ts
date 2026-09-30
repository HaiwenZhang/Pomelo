/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/** A class or object that cleans up its resources when dispose() is called. */
export interface IDisposable {
  dispose(): void;
}

/** A failure in one release must not prevent the remaining owned resources from closing. */
export function runCleanup(
  actions: Iterable<() => void>,
  message = "Resource cleanup failed",
) {
  const errors: unknown[] = [];
  for (const action of actions) {
    try {
      action();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, message);
}

/** Preserve the operation failure while also reporting any rollback failures. */
export function cleanupAfterFailure(
  failure: unknown,
  actions: Iterable<() => void>,
): never {
  try {
    runCleanup(actions);
  } catch (cleanupError) {
    throw new AggregateError(
      [failure, cleanupError],
      "Operation and cleanup failed",
      { cause: failure },
    );
  }
  throw failure;
}

/** A collection of disposable items that can be disposed of together. */
export class Disposables implements IDisposable {
  private readonly disposables = new Set<IDisposable>();
  private disposed = false;

  add<T extends IDisposable>(item: T): T {
    if (this.disposed)
      throw new Error(
        "Tried to add item to a DisposableStack that is already disposed",
      );
    this.disposables.add(item);
    return item;
  }

  disposeAndRemove<T extends IDisposable>(item: T): void {
    if (!item) return;
    if (this.disposables.delete(item)) item.dispose();
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try {
      runCleanup([...this.disposables].map((item) => () => item.dispose()));
    } finally {
      this.disposables.clear();
    }
  }
}
