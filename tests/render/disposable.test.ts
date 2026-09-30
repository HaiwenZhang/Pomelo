import { test, expect } from "vitest";

import {
  Disposables,
  cleanupAfterFailure,
  type IDisposable,
} from "../../src/lib/disposable";

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

test("rollback reports cleanup errors while preserving the original failure", () => {
  const failure = Error("prepare failed"),
    released: number[] = [];
  let result: unknown;
  try {
    cleanupAfterFailure(failure, [
      () => {
        released.push(1);
        throw Error("release failed");
      },
      () => {
        released.push(2);
      },
    ]);
  } catch (error) {
    result = error;
  }
  expect(result).toBeInstanceOf(AggregateError);
  expect((result as AggregateError).cause).toBe(failure);
  expect((result as AggregateError).errors[0]).toBe(failure);
  expect(released).toEqual([1, 2]);
});

test("cleanup releases all resources and remains idempotent after failures", () => {
  const resources = new Disposables(),
    disposed: number[] = [];
  resources.add({
    dispose() {
      disposed.push(1);
      throw Error("first");
    },
  });
  resources.add({
    dispose() {
      disposed.push(2);
      resources.dispose();
    },
  });
  resources.add({
    dispose() {
      disposed.push(3);
      throw Error("third");
    },
  });
  expect(() => resources.dispose()).toThrow(AggregateError);
  expect(disposed).toEqual([1, 2, 3]);
  expect(resources.isDisposed).toBe(true);
  resources.dispose();
  expect(disposed).toEqual([1, 2, 3]);
  expect(() => resources.add({ dispose() {} })).toThrow();
});
