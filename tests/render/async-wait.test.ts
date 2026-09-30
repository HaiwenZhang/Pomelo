import { expect, test, vi } from "vitest";
import { nextFrame, withAbort } from "../../src/lib/async-wait";

test("cancelling a suspended animation frame releases the request and abort listener", async () => {
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 42),
  );
  const cancel = vi.fn();
  vi.stubGlobal("cancelAnimationFrame", cancel);
  try {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const pending = nextFrame(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(cancel).toHaveBeenCalledWith(42);
    expect(remove).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

test("an aborted GPU wait observes late rejection and successful waits detach listeners", async () => {
  const controller = new AbortController();
  let fail!: (error: unknown) => void;
  const pending = withAbort(
    new Promise<void>((_resolve, reject) => {
      fail = reject;
    }),
    controller.signal,
  );
  controller.abort("closed");
  await expect(pending).rejects.toBe("closed");
  fail(Error("late rejection"));
  await Promise.resolve();
  const next = new AbortController();
  const remove = vi.spyOn(next.signal, "removeEventListener");
  await expect(withAbort(Promise.resolve(7), next.signal)).resolves.toBe(7);
  expect(remove).toHaveBeenCalledOnce();
});
