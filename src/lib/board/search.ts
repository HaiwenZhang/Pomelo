import { completeSteps, completeStepsAsync } from "../iteration";
import type { BoardScene } from "./model";
export type SearchItem =
  | {
      kind: "net";
      id: number;
      name: string;
      count: number;
    }
  | {
      kind: "component";
      id: string;
      name: string;
      count: number;
    };
/** Search entries retain scene insertion order; asynchronous preparation supports cancellation. */
export class BoardSearchIndex {
  private readonly entries: {
    item: SearchItem;
    name: string;
    sequence: number;
  }[];
  constructor(readonly data: SearchItem[]) {
    this.entries = data.map((item, sequence) => ({
      item,
      name: item.name.toLocaleLowerCase(),
      sequence,
    }));
  }
  static buildItems(scene: BoardScene): SearchItem[] {
    return completeSteps(BoardSearchIndex.steps(scene));
  }
  /** Finish before publishing the scene; React consumes only the prepared list. */
  static async buildItemsAsync(
    scene: BoardScene,
    signal?: AbortSignal,
  ): Promise<SearchItem[]> {
    return completeStepsAsync(BoardSearchIndex.steps(scene), signal);
  }
  find(query: string, limit = 20): SearchItem[] {
    const text = query.trim().toLocaleLowerCase();
    const count = Math.min(this.entries.length, Math.floor(limit));
    if (!text || !(count > 0)) return [];
    type Entry = (typeof this.entries)[number];
    const compare = (a: Entry, b: Entry) =>
      Number(b.name === text) - Number(a.name === text) ||
      Number(b.name.startsWith(text)) - Number(a.name.startsWith(text)) ||
      a.name.localeCompare(b.name) ||
      a.sequence - b.sequence;
    // Keep only the best results, with the worst one at the heap root.
    // Scene names are normalized once; queries allocate at most `limit` entries.
    const best: Entry[] = [];
    for (const entry of this.entries) {
      if (!entry.name.includes(text)) continue;
      if (best.length < count) {
        let i = best.length;
        best.push(entry);
        while (i > 0) {
          const parent = (i - 1) >>> 1;
          if (compare(best[parent], entry) >= 0) break;
          best[i] = best[parent];
          i = parent;
        }
        best[i] = entry;
      } else if (compare(entry, best[0]) < 0) {
        let i = 0;
        while (i * 2 + 1 < best.length) {
          let child = i * 2 + 1;
          if (
            child + 1 < best.length &&
            compare(best[child + 1], best[child]) > 0
          )
            child++;
          if (compare(entry, best[child]) >= 0) break;
          best[i] = best[child];
          i = child;
        }
        best[i] = entry;
      }
    }
    return best.sort(compare).map((entry) => entry.item);
  }
  private static *steps(scene: BoardScene): Generator<undefined, SearchItem[]> {
    const nets = new Map<number, number>(),
      components = new Map<string, number>();
    let work = 0;
    // Preserve insertion order without a temporary array of every board object.
    for (const group of [scene.segments, scene.vias, scene.pins, scene.zones])
      for (const object of group) {
        if (object.net) nets.set(object.net, (nets.get(object.net) ?? 0) + 1);
        if ((++work & 2047) === 0) yield;
      }
    for (const pin of scene.pins) {
      if (pin.reference)
        components.set(pin.reference, (components.get(pin.reference) ?? 0) + 1);
      if ((++work & 2047) === 0) yield;
    }
    for (const via of scene.vias) {
      if (via.finger?.reference)
        components.set(
          via.finger.reference,
          (components.get(via.finger.reference) ?? 0) + 1,
        );
      if ((++work & 2047) === 0) yield;
    }
    const result: SearchItem[] = [];
    for (const [id, count] of nets) {
      result.push({
        kind: "net",
        id,
        name: scene.nets.get(id) ?? String(id),
        count,
      });
      if ((++work & 2047) === 0) yield;
    }
    for (const [id, count] of components) {
      result.push({ kind: "component", id, name: id, count });
      if ((++work & 2047) === 0) yield;
    }
    return result;
  }
}
