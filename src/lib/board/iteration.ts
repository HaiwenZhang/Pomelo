/** Synchronous completion of the same bounded traversal used by cooperative callers. */
export class BoardIteration {
  static complete<T>(steps: Generator<void, T>): T {
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  }
}
