import { cooperative } from "../cooperative";
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
  constructor(readonly data: SearchItem[]) {}
  static buildItems(scene: BoardScene): SearchItem[] {
    const steps = BoardSearchIndex.steps(scene);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  }
  /** Finish before publishing the scene; React consumes only the prepared list. */
  static async buildItemsAsync(
    scene: BoardScene,
    signal?: AbortSignal,
  ): Promise<SearchItem[]> {
    const steps = BoardSearchIndex.steps(scene),
      pauseIfNeeded = cooperative(signal, 8);
    signal?.throwIfAborted();
    try {
      let step = steps.next();
      while (!step.done) {
        const pause = pauseIfNeeded();
        if (pause) await pause;
        step = steps.next();
      }
      return step.value;
    } finally {
      steps.return([]);
    }
  }
  find(query: string, limit = 20): SearchItem[] {
    const items = this.data;
    const text = query.trim().toLocaleLowerCase();
    if (!text) return [];
    return items
      .map((item) => ({ item, name: item.name.toLocaleLowerCase() }))
      .filter((item) => item.name.includes(text))
      .sort(
        (a, b) =>
          Number(b.name === text) - Number(a.name === text) ||
          Number(b.name.startsWith(text)) - Number(a.name.startsWith(text)) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, limit)
      .map((value) => value.item);
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
