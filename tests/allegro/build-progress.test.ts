import { expect, test, vi } from "vitest";
import { AllegroBuildProgress } from "../../src/lib/allegro/build-progress";

test("progress checkpoints stay synchronous within budget and cancel across a scheduled pause", async () => {
  vi.useFakeTimers();
  const clock = vi.spyOn(performance, "now").mockReturnValue(0);
  try {
    const controller = new AbortController();
    const report = vi.fn();
    const progress = new AllegroBuildProgress(controller.signal, report);
    progress.begin("构建铜皮");
    expect(progress.checkpoint()).toBeUndefined();
    expect(report.mock.calls).toStrictEqual([["构建铜皮"]]);

    clock.mockReturnValue(11);
    const pending = progress.checkpoint();
    expect(pending).toBeInstanceOf(Promise);
    expect(report.mock.calls).toStrictEqual([["构建铜皮"], ["构建铜皮"]]);
    const cancelled = expect(pending).rejects.toMatchObject({
      name: "AbortError",
    });
    controller.abort();
    await vi.runAllTimersAsync();
    await cancelled;
    expect(() => progress.checkpoint()).toThrow();
  } finally {
    clock.mockRestore();
    vi.useRealTimers();
  }
});
