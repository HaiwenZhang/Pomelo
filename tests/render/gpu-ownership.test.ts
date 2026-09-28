import { test, expect, vi } from "vitest";
import { GpuGeometry } from "../../src/lib/render/gpu-geometry";
import { GpuBatchSet } from "../../src/lib/render/gpu-batch-set";
import type { GpuBatch } from "../../src/lib/render/webgpu-batch-uploader";
import { LatestTask } from "../../src/lib/render/latest-task";

test("range views do not own allocations; owner destruction invalidates sorted and shared views", () => {
  const destroy = vi.fn(),
    owner = new GpuGeometry([{ destroy } as unknown as GPUBuffer]);
  const base = new GpuBatchSet();
  base.own(owner);
  const view = { owner, layer: 0, category: "zone", count: 3 } as GpuBatch;
  base.batches.push(view);
  const overlay = new GpuBatchSet();
  overlay.batches.push({ ...view });
  overlay.dispose();
  expect(owner.alive).toBe(true);
  expect(destroy).not.toHaveBeenCalled();
  const invalidate = vi.fn();
  owner.onDispose(invalidate);
  const sorted = [...base.batches];
  base.dispose();
  expect(sorted[0].owner.alive).toBe(false);
  expect(invalidate).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
  base.dispose();
  owner.dispose();
  expect(destroy).toHaveBeenCalledOnce();
});
test("throwing invalidation callbacks cannot leak the remaining GPU buffers or owners", () => {
  const destroy = vi.fn(),
    first = new GpuGeometry([{ destroy } as unknown as GPUBuffer]),
    second = new GpuGeometry([{ destroy } as unknown as GPUBuffer]);
  first.onDispose(() => {
    throw Error("observer");
  });
  const set = new GpuBatchSet();
  set.own(first);
  set.own(second);
  expect(() => set.dispose()).toThrow();
  expect(destroy).toHaveBeenCalledTimes(2);
  expect(second.alive).toBe(false);
  expect(() => set.dispose()).not.toThrow();
});
test("task generations reject late results and stale finish never removes the next task", () => {
  const scope = new LatestTask(),
    first = scope.start(),
    second = scope.start();
  expect(first.signal.aborted).toBe(true);
  expect(second.generation).toBeGreaterThan(first.generation);
  expect(() => first.assertCurrent()).toThrow();
  first.finish();
  second.assertCurrent();
  scope.dispose();
  expect(second.signal.aborted).toBe(true);
  expect(() => second.assertCurrent()).toThrow();
  expect(() => scope.start()).toThrow();
});
test("parent abort is propagated and task completion detaches parent listeners", () => {
  const parent = new AbortController(),
    remove = vi.spyOn(parent.signal, "removeEventListener"),
    scope = new LatestTask();
  const task = scope.start(parent.signal);
  task.finish();
  expect(remove).toHaveBeenCalledOnce();
  const next = scope.start(parent.signal);
  parent.abort("closed");
  expect(next.signal.reason).toBe("closed");
  expect(() => next.assertCurrent()).toThrow();
  scope.dispose();
});
