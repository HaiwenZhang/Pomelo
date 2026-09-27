import { test, expect, onTestFinished } from "vitest";

import type { PadsCopperFill } from "../../src/lib/pads/copper/copper";
import { PadsCopperMeshBuilder } from "../../src/lib/pads/copper/copper-mesh";
import { PadsCopperBatch } from "../../src/lib/pads/copper/copper-batch";
import {
  PadsCopperWorkerPool,
  type PadsCopperWorker,
} from "../../src/lib/pads/copper/copper-workers";
import type {
  PadsCopperJob,
  PadsCopperReply,
} from "../../src/lib/pads/copper/copper-mesh";

function fill(owner: number, edges = 4): PadsCopperFill {
  const vertices = Array.from({ length: edges }, (_, i) => {
    const angle = (i * 2 * Math.PI) / edges;
    return [Math.cos(angle), Math.sin(angle)] as [number, number];
  });
  return {
    owner,
    boundary: 0,
    layer: 0,
    net: null,
    outer: {
      piece: owner,
      width: 0,
      path: vertices.map((a, i) => ({
        id: owner,
        trackId: owner,
        layer: 0,
        net: 0,
        width: 0,
        a,
        b: vertices[(i + 1) % edges],
      })),
    },
    holes: [],
    thermals: [],
    zeroWidthThermalMarkers: [],
    unresolvedThermalPieces: [],
  };
}

/** The browser worker is the external boundary; messages are completed explicitly. */
class ControlledWorker implements PadsCopperWorker {
  onmessage: PadsCopperWorker["onmessage"] = null;
  onerror: PadsCopperWorker["onerror"] = null;
  onmessageerror: PadsCopperWorker["onmessageerror"] = null;
  jobs: PadsCopperJob[] = [];
  terminated = false;
  postMessage(job: PadsCopperJob) {
    this.jobs.push(job);
  }
  terminate() {
    this.terminated = true;
  }
  reply(reply: PadsCopperReply) {
    this.onmessage?.({ data: reply } as MessageEvent<PadsCopperReply>);
  }
  async finish() {
    const job = this.jobs.at(-1)!;
    this.reply({
      type: "complete",
      index: job.index,
      meshes: await new PadsCopperMeshBuilder(job.fill).build(),
    });
  }
}

test("should preserve mesh bytes and source order when workers finish out of order", async () => {
  const fills = [fill(1), fill(2, 16), fill(3, 8)];
  const expected = await Promise.all(
    fills.map((source) => new PadsCopperMeshBuilder(source).build()),
  );
  const workers: ControlledWorker[] = [],
    progress: number[] = [];
  const pool = new PadsCopperWorkerPool(() => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  }, 2);
  const pending = pool.build(fills, undefined, (completed) =>
    progress.push(completed),
  );
  expect(workers.length).toBe(2);
  expect(workers.map((worker) => worker.jobs[0].index)).toStrictEqual([1, 2]);
  await workers[1].finish();
  expect(workers[1].jobs[1].index).toBe(0);
  await workers[1].finish();
  await workers[0].finish();
  expect(await pending).toStrictEqual(expected);
  expect(progress).toStrictEqual([1, 2, 3]);
  expect(workers.every((worker) => worker.terminated)).toBeTruthy();
});

test("should terminate all workers and retain the abort reason when import is cancelled", async () => {
  const workers: ControlledWorker[] = [],
    controller = new AbortController();
  const pending = new PadsCopperWorkerPool(() => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  }, 2).build([fill(1), fill(2)], controller.signal);
  const reason = new Error("cancelled by a newer import");
  controller.abort(reason);
  await expect(pending).rejects.toBe(reason);
  expect(
    workers.every((worker) => worker.terminated && worker.onmessage === null),
  ).toBeTruthy();
});

test("should create no workers when the batch is empty or already aborted", async () => {
  const pool = new PadsCopperWorkerPool(() => {
    throw new Error("unexpected worker");
  }, 2);
  expect(await pool.build([])).toStrictEqual([]);
  await expect(
    pool.build([fill(1)], AbortSignal.abort()),
  ).rejects.toMatchObject({
    name: "AbortError",
  });
});

test("should report the geometry error and release the pool when a task fails", async () => {
  const workers: ControlledWorker[] = [];
  const pending = new PadsCopperWorkerPool(() => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  }, 2).build([fill(1), fill(2)]);
  workers[0].reply({
    type: "error",
    index: 0,
    error: { name: "Error", message: "PADS 热连接存在未解析几何" },
  });
  await expect(pending).rejects.toThrow(/PADS 热连接存在未解析几何/);
  expect(workers.every((worker) => worker.terminated)).toBeTruthy();
});

test("should release earlier workers when a later worker cannot start", async () => {
  const first = new ControlledWorker();
  let calls = 0;
  const pending = new PadsCopperWorkerPool(() => {
    if (calls++) throw new Error("worker blocked");
    return first;
  }, 2).build([fill(1), fill(2)]);
  await expect(pending).rejects.toThrow(/worker blocked/);
  expect(first.terminated).toBeTruthy();
});

test("should release the pool when posting a task fails", async () => {
  const worker = new ControlledWorker();
  worker.postMessage = () => {
    throw new Error("clone failed");
  };
  await expect(
    new PadsCopperWorkerPool(() => worker, 1).build([fill(1)]),
  ).rejects.toThrow(/clone failed/);
  expect(worker.terminated).toBeTruthy();
});

test("should reject and release workers when progress cancels the last task", async () => {
  const worker = new ControlledWorker(),
    controller = new AbortController();
  const pending = new PadsCopperWorkerPool(() => worker, 1).build(
    [fill(1)],
    controller.signal,
    () => controller.abort(),
  );
  const rejection = expect(pending).rejects.toMatchObject({
    name: "AbortError",
  });
  await worker.finish();
  await rejection;
  expect(worker.terminated).toBeTruthy();
});

test("should transfer all mesh buffers without changing their contents when returning worker results", async () => {
  const meshes = await new PadsCopperMeshBuilder(fill(1)).build();
  const expected = structuredClone(meshes),
    buffers = PadsCopperMeshBuilder.transfers(meshes);
  expect(new Set(buffers).size).toBe(buffers.length);
  const received = structuredClone(meshes, { transfer: buffers });
  expect(received).toStrictEqual(expected);
  expect(buffers.every((buffer) => buffer.byteLength === 0)).toBeTruthy();
});

test("should use serial geometry when browser workers cannot be constructed", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  onTestFinished(() => {
    if (original) Object.defineProperty(globalThis, "Worker", original);
    else Reflect.deleteProperty(globalThis, "Worker");
  });
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: class {
      constructor() {
        throw new Error("Worker blocked by browser policy");
      }
    },
  });
  const fills = [fill(1, 512)];
  const expected = await new PadsCopperMeshBuilder(fills[0]).build();
  expect(await new PadsCopperBatch(fills).build()).toStrictEqual([expected]);
});

test("should avoid worker startup when the board has little copper work", async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  let created = false;
  onTestFinished(() => {
    if (original) Object.defineProperty(globalThis, "Worker", original);
    else Reflect.deleteProperty(globalThis, "Worker");
  });
  Object.defineProperty(globalThis, "Worker", {
    configurable: true,
    value: class {
      constructor() {
        created = true;
        throw new Error("Unexpected worker");
      }
    },
  });
  const source = fill(1);
  expect(await new PadsCopperBatch([source]).build()).toStrictEqual([
    await new PadsCopperMeshBuilder(source).build(),
  ]);
  expect(created).toBe(false);
});

test("should release all workers when a worker script fails asynchronously", async () => {
  const workers: ControlledWorker[] = [];
  const pending = new PadsCopperWorkerPool(() => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  }, 2).build([fill(1), fill(2)]);
  let prevented = false;
  workers[0].onerror?.({
    message: "worker script failed",
    preventDefault: () => {
      prevented = true;
    },
  } as ErrorEvent);
  await expect(pending).rejects.toThrow(/worker script failed/);
  expect(
    prevented && workers.every((worker) => worker.terminated),
  ).toBeTruthy();
});

test("should release all workers when the browser cannot deserialize a reply", async () => {
  const worker = new ControlledWorker();
  const pending = new PadsCopperWorkerPool(() => worker, 1).build([fill(1)]);
  worker.onmessageerror?.({} as MessageEvent);
  await expect(pending).rejects.toThrow(/could not be read/);
  expect(worker.terminated).toBeTruthy();
});
