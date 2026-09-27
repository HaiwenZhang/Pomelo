export interface OutlineRange<T> {
  batch: T;
  start: number;
  count: number;
}

/** Preserve the original selection order (all lines, then arcs). Adjacent
 * selected ranges share a draw; gaps must never expose unselected outlines. */
export class BorrowedOutlineCollector {
  static *collectSteps<T extends { arcs?: boolean }>(
    ids: readonly number[],
    index: ReadonlyMap<number, readonly OutlineRange<T>[]>,
  ): Generator<OutlineRange<T> | undefined> {
    const groups = new Map<T, OutlineRange<T>[]>();
    let work = 0;
    for (const id of ids) {
      if ((++work & 255) === 0) yield;
      for (const entry of index.get(id) ?? []) {
        if (!entry.count) continue;
        let group = groups.get(entry.batch);
        if (!group) {
          group = [];
          groups.set(entry.batch, group);
        }
        const last = group.at(-1);
        if (last && last.start + last.count === entry.start)
          last.count += entry.count;
        else group.push({ ...entry });
      }
    }
    for (const arcs of [false, true])
      for (const [batch, ranges] of groups)
        if (!!batch.arcs === arcs) yield* ranges;
  }
}
