import { expect, test, vi } from "vitest";
import { createBoardLoader, loadBoard } from "../../src/lib/import/load-board";
import type { BoardImporter, LoadedBoard } from "../../src/lib/import/model";
import type { ProgressReporter, ProgressUpdate } from "../../src/lib/progress";
import { createViewerStore } from "../../src/lib/viewer-store";

const bytes = new TextEncoder().encode(`(kicad_pcb
  (version 20260206)
  (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (net 1 "GND")
  (segment (start 0 0) (end 5 0) (width 0.2) (layer "F.Cu") (net 1))
)`);
const source = {
  name: "BOARD.KICAD_PCB",
  size: bytes.byteLength,
  arrayBuffer: async () => bytes.buffer,
};

test("the shared loader imports a real KiCad file and prepares search and file information", async () => {
  const updates: ProgressUpdate[] = [];
  const loaded = await loadBoard(
    source,
    new AbortController().signal,
    (update) => updates.push(update),
  );
  expect(loaded.file).toMatchObject({
    name: source.name,
    size: bytes.byteLength,
    format: "kicad",
    records: 4,
    kicad: { version: 20260206, sourceRoutes: 1, sourceObjects: 4 },
  });
  expect(loaded.scene.segments).toHaveLength(1);
  expect(loaded.searchItems).toEqual([
    { kind: "net", id: 1, name: "GND", count: 1 },
  ]);
  expect(updates.at(-1)).toEqual({ phase: "构建搜索索引", fraction: 0.7 });
});

test("cancelling while the file is being read prevents the importer from starting", async () => {
  let finish!: (buffer: ArrayBuffer) => void;
  const importer = vi.fn<BoardImporter>();
  const controller = new AbortController();
  const pending = createBoardLoader(importer)(
    {
      ...source,
      arrayBuffer: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
    controller.signal,
  );
  controller.abort();
  finish(bytes.buffer);
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(importer).not.toHaveBeenCalled();
});

test("a late importer completion after cancellation cannot start common preparation", async () => {
  const loaded = await loadBoard(source, new AbortController().signal);
  let finish!: () => void;
  let started!: () => void;
  let report: ProgressReporter | undefined;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const importer: BoardImporter = async (_name, _buffer, _signal, progress) => {
    report = progress;
    started();
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { scene: loaded.scene, metadata: loaded.file };
  };
  const updates: ProgressUpdate[] = [];
  const controller = new AbortController();
  const pending = createBoardLoader(importer)(
    source,
    controller.signal,
    (update) => updates.push(update),
  );
  await ready;
  controller.abort();
  report?.({ phase: "late source progress", fraction: 0.4 });
  finish();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  expect(updates).toEqual([]);
});

test("store progress follows structured fractions and ignores late reports after cancellation", async () => {
  const loaded = await loadBoard(source, new AbortController().signal);
  let finish!: (loaded: LoadedBoard) => void;
  let report: ProgressReporter | undefined;
  const store = createViewerStore(async (_source, _signal, progress) => {
    report = progress;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = store.getState().open(source);
  report?.({ phase: "Any translated label", fraction: 0.42 });
  expect(store.getState().progress).toBe(0.42);
  report?.({ phase: "构建拾取索引" });
  expect(store.getState().phase).toBe("构建拾取索引");
  expect(store.getState().progress).toBe(0.42);
  store.getState().cancel();
  report?.({ phase: "late renderer progress", fraction: 0.99 });
  finish(loaded);
  await pending;
  expect(store.getState()).toMatchObject({
    phase: "已取消",
    progress: null,
    scene: null,
    file: null,
  });
});
