/*
    Copyright (c) 2022 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

/** A class or object that cleans up its resources when dispose() is called. */
export interface IDisposable {
  dispose(): void;
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
    item.dispose();
    this.disposables.delete(item);
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) {
      console.trace("dispose() called on an already disposed resource");
      return;
    }
    for (const item of this.disposables) item.dispose();
    this.disposables.clear();
    this.disposed = true;
  }
}
