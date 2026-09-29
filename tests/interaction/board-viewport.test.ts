import { expect, test, vi } from "vitest";
import type { Bounds } from "../../src/lib/board/model";
import { BoardViewport } from "../../src/lib/interaction/board-viewport";
import { TestCanvas } from "./canvas-fixture";

function fixture() {
  const canvas = new TestCanvas();
  const source: Bounds = { minX: 10, minY: 20, maxX: 110, maxY: 120 };
  const invalidate = vi.fn();
  const viewport = new BoardViewport(canvas.element, () => source, invalidate);
  viewport.setInsets({ left: 200, right: 0, top: 100, bottom: 0 });
  return { viewport, source, invalidate };
}

test.each([false, true])(
  "fit, focus and zoom respect the usable canvas center with flipped=%s",
  (flipped) => {
    const { viewport, source } = fixture();
    viewport.setFlipped(flipped);
    viewport.fit();
    // Canvas is offset by (20, 30); insets put its usable center at (500, 350).
    const center = viewport.worldPoint(520, 380)!;
    expect(center[0]).toBeCloseTo(60);
    expect(center[1]).toBeCloseTo(70);
    viewport.zoom(2);
    const zoomed = viewport.worldPoint(520, 380)!;
    expect(zoomed[0]).toBeCloseTo(center[0]);
    expect(zoomed[1]).toBeCloseTo(center[1]);
    viewport.focusBounds({ minX: 20, minY: 30, maxX: 30, maxY: 40 }, source);
    const focused = viewport.worldPoint(520, 380)!;
    expect(focused[0]).toBeCloseTo(25);
    expect(focused[1]).toBeCloseTo(35);
    expect(viewport.getBoardPoint(19, 380)).toBeNull();
  },
);

test("view snapshots publish on frame changes and dispose releases subscriptions", () => {
  const { viewport, invalidate } = fixture();
  const notify = vi.fn();
  const unsubscribe = viewport.subscribeView(notify);
  const initial = viewport.getView();
  viewport.publishView();
  expect(viewport.getView()).toBe(initial);
  expect(notify).not.toHaveBeenCalled();
  viewport.fit();
  expect(invalidate).toHaveBeenCalledOnce();
  viewport.publishView();
  expect(viewport.getView().zoom).toBe(100);
  viewport.zoom(2);
  viewport.publishView();
  expect(viewport.getView().zoom).toBeCloseTo(200);
  const latest = viewport.getView();
  viewport.publishView();
  expect(viewport.getView()).toBe(latest);
  unsubscribe();
  viewport.subscribeView(notify);
  viewport.dispose();
  notify.mockClear();
  viewport.zoom(2);
  viewport.publishView();
  expect(notify).not.toHaveBeenCalled();
});
