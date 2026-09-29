import { afterEach, expect, test, vi } from "vitest";
import type { BoardScene } from "../../src/lib/board/model";
import { BoardIndex, type PickHit } from "../../src/lib/interaction/picking";
import { TooltipController } from "../../src/lib/interaction/tooltip-controller";
import type { hoverDetails } from "../../src/lib/interaction/hover-details";

afterEach(() => vi.useRealTimers());

function fixture(details: typeof hoverDetails) {
  vi.useFakeTimers();
  const scene: BoardScene = {
    layers: [],
    nets: new Map(),
    segments: [],
    pins: [],
    vias: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
    diagnostics: [],
  };
  let current = scene;
  const hit: PickHit = {
    object: {
      kind: "segment",
      value: {
        id: 1,
        trackId: 1,
        net: 1,
        layer: 0,
        a: [0, 0],
        b: [1, 1],
        width: 0.2,
      },
    },
    layer: 0,
    category: "etch",
    distance: 0,
  };
  const onError = vi.fn();
  const index = new BoardIndex(scene);
  const controller = new TooltipController(
    { context: () => ({ scene: current, index, mode: "object" }), onError },
    details,
  );
  return {
    controller,
    hit,
    onError,
    replace: () => {
      current = { ...scene };
    },
  };
}

test("hover details are delayed and subscribers see show/hide updates", async () => {
  const details = vi
    .fn<typeof hoverDetails>()
    .mockResolvedValue(["Length: 1 mm"]);
  const f = fixture(details);
  const notify = vi.fn();
  const unsubscribe = f.controller.subscribeTooltip(notify);
  try {
    f.controller.schedule(f.hit, [10, 20]);
    await vi.advanceTimersByTimeAsync(349);
    expect(details).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(f.controller.getTooltip()).toEqual({
      point: [10, 20],
      lines: ["Length: 1 mm"],
    });
    expect(notify).toHaveBeenCalledOnce();
    f.controller.hide();
    expect(f.controller.getTooltip()).toBe(null);
    expect(notify).toHaveBeenCalledTimes(2);
    unsubscribe();
    f.controller.schedule(f.hit, [20, 30]);
    await vi.advanceTimersByTimeAsync(350);
    expect(notify).toHaveBeenCalledTimes(2);
  } finally {
    f.controller.dispose();
  }
});

test("a superseded async result cannot overwrite the latest pointer tooltip", async () => {
  let finish!: (lines: string[]) => void;
  let oldSignal!: AbortSignal;
  const details = vi
    .fn<typeof hoverDetails>()
    .mockImplementationOnce(async (_scene, _index, _hit, _mode, signal) => {
      oldSignal = signal!;
      return new Promise((resolve) => {
        finish = resolve;
      });
    })
    .mockResolvedValue(["latest"]);
  const f = fixture(details);
  try {
    f.controller.schedule(f.hit, [1, 1]);
    await vi.advanceTimersByTimeAsync(350);
    f.controller.schedule(f.hit, [2, 2]);
    expect(oldSignal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(350);
    finish(["stale"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.controller.getTooltip()).toEqual({
      point: [2, 2],
      lines: ["latest"],
    });
    expect(f.onError).not.toHaveBeenCalled();
  } finally {
    f.controller.dispose();
  }
});

test("scene replacement suppresses late details even when the dependency ignores cancellation", async () => {
  let finish!: (lines: string[]) => void;
  const f = fixture(
    async () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  try {
    f.controller.schedule(f.hit, [1, 1]);
    await vi.advanceTimersByTimeAsync(350);
    f.replace();
    finish(["old board"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.controller.getTooltip()).toBe(null);
  } finally {
    f.controller.dispose();
  }
});

test("errors from current jobs are reported and dispose cancels scheduled work", async () => {
  const details = vi
    .fn<typeof hoverDetails>()
    .mockRejectedValue(Error("detail failed"));
  const f = fixture(details);
  f.controller.schedule(f.hit, [1, 1]);
  await vi.advanceTimersByTimeAsync(350);
  expect(f.onError).toHaveBeenCalledExactlyOnceWith("detail failed");
  f.controller.schedule(f.hit, [2, 2]);
  f.controller.dispose();
  await vi.advanceTimersByTimeAsync(350);
  expect(details).toHaveBeenCalledOnce();
  expect(f.controller.getTooltip()).toBe(null);
});
