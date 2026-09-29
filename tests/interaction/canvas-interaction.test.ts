import { afterEach, expect, test, vi } from "vitest";
import { BoardViewport } from "../../src/lib/interaction/board-viewport";
import { CanvasInteractionController } from "../../src/lib/interaction/canvas-interaction";
import type { PickHit } from "../../src/lib/interaction/picking";
import { emit, installCanvasEnvironment, TestCanvas } from "./canvas-fixture";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const environment = installCanvasEnvironment();
  const canvas = new TestCanvas();
  const invalidate = vi.fn();
  const viewport = new BoardViewport(
    canvas.element,
    () => ({ minX: 0, minY: 0, maxX: 100, maxY: 100 }),
    invalidate,
  );
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
  const host = {
    pick: vi.fn(() => hit),
    hover: vi.fn(),
    select: vi.fn(),
    scheduleTooltip: vi.fn(),
    hideTooltip: vi.fn(),
    fit: vi.fn(() => viewport.fit()),
    resize: vi.fn(),
  };
  const controller = new CanvasInteractionController(
    canvas.element,
    viewport,
    host,
  );
  const pointer = (name: string, fields: object = {}) =>
    emit(canvas, name, {
      pointerId: 1,
      button: 0,
      clientX: 420,
      clientY: 330,
      ...fields,
    });
  return {
    ...environment,
    canvas,
    viewport,
    host,
    controller,
    pointer,
    hit,
    invalidate,
  };
}

test("click selects once while a drag pans without selecting", () => {
  const f = fixture();
  try {
    f.pointer("pointerdown");
    f.pointer("pointerup");
    expect(f.host.select).toHaveBeenCalledExactlyOnceWith(f.hit);
    expect(f.canvas.captures.size).toBe(0);
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 430, clientY: 340 });
    expect(f.canvas.style.cursor).toBe("grabbing");
    expect(f.viewport.camera.x).not.toBe(0);
    f.pointer("pointerup", { clientX: 430, clientY: 340 });
    expect(f.host.select).toHaveBeenCalledTimes(1);
  } finally {
    f.controller.dispose();
  }
});

test("tool changes release the active capture and another pointer cannot replace it", () => {
  const f = fixture();
  try {
    f.pointer("pointerdown");
    f.pointer("pointerdown", { pointerId: 2 });
    expect([...f.canvas.captures]).toEqual([1]);
    f.pointer("pointerup", { pointerId: 2 });
    expect(f.host.select).not.toHaveBeenCalled();
    f.controller.setTool("pan");
    expect(f.canvas.captures.size).toBe(0);
    expect(f.canvas.style.cursor).toBe("grab");
    f.pointer("pointerup");
    expect(f.host.select).not.toHaveBeenCalled();
    f.pointer("pointerdown");
    f.pointer("pointermove", { clientX: 422 });
    f.pointer("pointerup", { clientX: 422 });
    expect(f.host.select).not.toHaveBeenCalled();
    expect(f.invalidate).toHaveBeenCalled();
  } finally {
    f.controller.dispose();
  }
});

test("hover uses canvas coordinates and wheel zoom preserves the pointed board position", () => {
  const f = fixture();
  try {
    f.pointer("pointermove", { clientX: 123, clientY: 145 });
    expect(f.host.scheduleTooltip).toHaveBeenCalledWith(f.hit, [103, 115]);
    const before = f.viewport.worldPoint(123, 145)!;
    const wheel = emit(f.canvas, "wheel", {
      deltaY: -100,
      clientX: 123,
      clientY: 145,
    });
    const after = f.viewport.worldPoint(123, 145)!;
    expect(wheel.defaultPrevented).toBe(true);
    expect(after[0]).toBeCloseTo(before[0], 12);
    expect(after[1]).toBeCloseTo(before[1], 12);
    f.controller.setTool("pan");
    const calls = f.host.pick.mock.calls.length;
    f.pointer("pointermove");
    expect(f.host.pick).toHaveBeenCalledTimes(calls);
  } finally {
    f.controller.dispose();
  }
});

test("dispose detaches canvas/window listeners, disconnects resize and releases capture", () => {
  const f = fixture();
  f.observers[0].trigger();
  expect(f.host.resize).toHaveBeenCalledOnce();
  emit(f.window, "keydown", { key: "F2" });
  expect(f.host.fit).toHaveBeenCalledOnce();
  emit(f.window, "keydown", { key: "Escape" });
  expect(f.host.select).toHaveBeenCalledWith(null);
  f.pointer("pointerdown");
  f.controller.dispose();
  f.controller.dispose();
  expect(f.canvas.captures.size).toBe(0);
  expect(f.observers[0].disconnect).toHaveBeenCalledOnce();
  vi.clearAllMocks();
  f.pointer("pointermove");
  emit(f.window, "keydown", { key: "F2" });
  emit(f.window, "blur");
  const wheel = emit(f.canvas, "wheel", {
    deltaY: 1,
    clientX: 420,
    clientY: 330,
  });
  expect(wheel.defaultPrevented).toBe(false);
  expect(f.host.pick).not.toHaveBeenCalled();
  expect(f.host.fit).not.toHaveBeenCalled();
  expect(f.host.hover).not.toHaveBeenCalled();
});
