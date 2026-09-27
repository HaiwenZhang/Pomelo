import { test, expect } from "vitest";

import { Disposables, type IDisposable } from "../../src/lib/disposable";

test("disposable collection releases owned resources once and rejects late additions", () => {
  const disposed: string[] = [];
  const resources = new Disposables();
  const first: IDisposable = {
    dispose: () => {
      disposed.push("first");
    },
  };
  const second: IDisposable = {
    dispose: () => {
      disposed.push("second");
    },
  };
  expect(resources.add(first)).toBe(first);
  resources.add(second);
  resources.disposeAndRemove(first);
  resources.dispose();
  expect(disposed).toStrictEqual(["first", "second"]);
  expect(resources.isDisposed).toBe(true);
  expect(() => resources.add({ dispose() {} })).toThrow();
});
