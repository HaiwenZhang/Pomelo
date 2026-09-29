import { test, expect } from "vitest";

import type { BrdHeader } from "../../src/lib/allegro/binary/header";
import { BrdTextDecoder } from "../../src/lib/allegro/binary/text-decoder";
import { BrdDatabase } from "../../src/lib/allegro/database";
import type { BoardScene } from "../../src/lib/board/model";
import { createViewerStore } from "../../src/lib/viewer-store";

import {
  importAllegro,
  type AllegroImportDependencies,
} from "../../src/lib/allegro/import";
import { createBoardLoader } from "../../src/lib/import/load-board";

function createTestStore(dependencies: AllegroImportDependencies) {
  return createViewerStore(
    createBoardLoader((_name, buffer, signal, progress, encoding) =>
      importAllegro(buffer, signal, progress, encoding, dependencies),
    ),
  );
}

const header: BrdHeader = {
  magic: 0x140400,
  version: 172,
  writerVersion: "fixture",
  objectCount: 0,
  stringCount: 0,
  units: 3,
  divisor: 1000,
  constraintEnd: 0,
  layerMap: [],
  textList: { head: 0, tail: 0 },
};
const scene: BoardScene = {
  layers: [],
  nets: new Map(),
  segments: [],
  vias: [],
  pins: [],
  zones: [],
  outline: [],
  texts: [],
  drawingLayers: [],
  bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
  diagnostics: [],
};
const source = (
  name: string,
  arrayBuffer = async () => new ArrayBuffer(1),
) => ({
  name,
  size: 1,
  arrayBuffer,
});
const dependencies = {
  parseBrd: async (buffer: ArrayBuffer) =>
    new BrdDatabase(buffer, header, new Map()),
  buildScene: async () => scene,
};

test("explicit encoding reaches the parser, reports bad offsets and clears diagnostics on reread", async () => {
  const store = createTestStore({
    parseBrd: async (buffer, _signal, _progress, encoding) => {
      const decoder = new BrdTextDecoder(encoding);
      decoder.decode(new Uint8Array(buffer), 0);
      return new BrdDatabase(buffer, header, new Map(), decoder);
    },
    buildScene: async () => ({ ...scene, diagnostics: [] }),
  });
  const file = source(
    "legacy",
    async () => Uint8Array.of(0xc7, 0xb0, 0xc9, 0xe3).buffer,
  );
  await store.getState().open(file);
  expect(store.getState().file?.encoding).toBe("utf-8");
  expect(store.getState().scene!.diagnostics.join()).toMatch(/utf-8.*1.*0x0/);
  await store.getState().open(file, undefined, "gbk");
  expect(store.getState().file?.encoding).toBe("gbk");
  expect(store.getState().scene!.diagnostics).toStrictEqual([]);
});
test("replacing a load prevents old completion from overwriting the new board", async () => {
  const store = createTestStore(dependencies);
  let resolve!: (value: ArrayBuffer) => void;
  const first = store
    .getState()
    .open(source("old", () => new Promise((r) => (resolve = r))));
  await store.getState().open(source("new"));
  resolve(new ArrayBuffer(1));
  await first;
  expect(store.getState().file?.name).toBe("new");
  expect(store.getState().scene).toBe(scene);
  expect(store.getState().error).toBe("");
  expect(store.getState().progress).toBe(null);
});
test("cancel clears loading immediately and rejects late completion; next load recovers", async () => {
  const store = createTestStore(dependencies);
  let resolve!: (value: ArrayBuffer) => void;
  const pending = store
    .getState()
    .open(source("cancelled", () => new Promise((r) => (resolve = r))));
  store.getState().cancel();
  expect(store.getState().progress).toBe(null);
  resolve(new ArrayBuffer(1));
  await pending;
  expect(store.getState().scene).toBe(null);
  await store.getState().open(source("recovered"));
  expect(store.getState().file?.name).toBe("recovered");
});
test("display updates preserve geometry identity and load resets board-specific selection and flip", async () => {
  const store = createTestStore(dependencies);
  await store.getState().open(source("board"));
  expect(store.getState().display.boardText).toBe(false);
  store.getState().setDisplay((d) => ({
    ...d,
    shapes: 0.75,
    boardText: true,
    hidden: new Set([3]),
  }));
  store.getState().setFlipped(true);
  expect(store.getState().scene).toBe(scene);
  expect(store.getState().display.shapes).toBe(0.75);
  await store.getState().open(source("next"));
  expect(store.getState().flipped).toBe(false);
  expect(store.getState().display.boardText).toBe(false);
  expect(store.getState().selection).toBe(null);
  expect(!store.getState().display.hidden.has(3)).toBeTruthy();
});
test("net color is the initial mode and restored for each new board", async () => {
  const store = createTestStore(dependencies);
  expect(store.getState().colorMode).toBe("net");
  await store.getState().open(source("board"));
  store.getState().setColorMode("layer");
  expect(store.getState().colorMode).toBe("layer");
  expect(store.getState().scene).toBe(scene);
  await store.getState().open(source("next"));
  expect(store.getState().colorMode).toBe("net");
});
test("load failures are displayed and do not retain loading state", async () => {
  const store = createTestStore({
    ...dependencies,
    parseBrd: async () => {
      throw Error("bad input");
    },
  });
  await store.getState().open(source("broken"));
  expect(store.getState().error).toBe("bad input");
  expect(store.getState().progress).toBe(null);
  expect(store.getState().scene).toBe(null);
});

test("loading remains pending until presentation completes and cancellation rejects late GPU completion", async () => {
  const store = createTestStore(dependencies);
  let finish!: () => void, started!: () => void, signal!: AbortSignal;
  const ready = new Promise<void>((r) => (started = r));
  const pending = store.getState().open(source("gpu"), {
    clear() {},
    prepare: async (_scene, s, progress) => {
      signal = s;
      progress({ phase: "上传板图", fraction: 0.85 });
      started();
      await new Promise<void>((r) => (finish = r));
    },
  });
  await ready;
  expect(store.getState().phase).toBe("上传板图");
  expect(store.getState().scene).toBe(null);
  expect(store.getState().progress).not.toBe(null);
  store.getState().cancel();
  expect(signal.aborted).toBeTruthy();
  finish();
  await pending;
  expect(store.getState().scene).toBe(null);
  expect(store.getState().file).toBe(null);
  expect(store.getState().error).toBe("");
  await store
    .getState()
    .open(source("next"), { clear() {}, prepare: async () => {} });
  expect(store.getState().file?.name).toBe("next");
});

test("presentation failure is reported without publishing a half-loaded scene", async () => {
  const store = createTestStore(dependencies);
  await store.getState().open(source("failure"), {
    clear() {},
    prepare: async () => {
      throw Error("GPU upload failed");
    },
  });
  expect(store.getState().error).toBe("GPU upload failed");
  expect(store.getState().scene).toBe(null);
  expect(store.getState().progress).toBe(null);
});

for (const action of ["cancel", "replace"] as const)
  test(`${action} during search preparation cannot publish stale search entries`, async () => {
    const count = 1_000_000;
    let reads = 0;
    const large = {
      ...scene,
      segments: new Array(count).fill({
        get net() {
          reads++;
          return 0;
        },
      }),
    };
    const small = {
      ...scene,
      nets: new Map([[2, "NEW"]]),
      segments: [{ net: 2 }] as BoardScene["segments"],
    };
    let next = large,
      prepared = 0,
      armed = true,
      replacement: Promise<void> | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    const store = createTestStore({
      ...dependencies,
      buildScene: async () => next,
    });
    const stop = store.subscribe((s) => {
      if (s.phase === "构建搜索索引" && armed) {
        armed = false;
        timer = setTimeout(() => {
          next = small;
          if (action === "cancel") store.getState().cancel();
          else replacement = store.getState().open(source("new"));
        }, 0);
      }
      expect(s.scene).not.toBe(large);
    });
    try {
      await store.getState().open(source("old"), {
        clear() {},
        prepare: async () => {
          prepared++;
        },
      });
      expect(prepared).toBe(0);
      expect(reads > 0 && reads < count).toBeTruthy();
      if (action === "cancel") {
        expect(store.getState().searchItems).toStrictEqual([]);
        expect(store.getState().scene).toBe(null);
        await store.getState().open(source("new"));
      } else await replacement;
      expect(store.getState().scene).toBe(small);
      expect(store.getState().searchItems).toStrictEqual([
        { kind: "net", id: 2, name: "NEW", count: 1 },
      ]);
      const pending = store.getState().open(
        source("broken", async () => {
          throw Error("read failed");
        }),
      );
      expect(store.getState().searchItems).toStrictEqual([]);
      await pending;
      expect(store.getState().searchItems).toStrictEqual([]);
      expect(store.getState().scene).toBe(null);
    } finally {
      stop();
      clearTimeout(timer);
    }
  });
