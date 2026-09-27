import { test, expect } from "vitest";

import { WebGPUBatchUploader } from "../../src/lib/render/webgpu-batch-uploader";
import type { BoardScene } from "../../src/lib/board/model";

test("batch uploader releases owned GPU buffers but skips borrowed ranges", () => {
  const destroyed: string[] = [];
  const buffer = (name: string) =>
    ({
      destroy() {
        destroyed.push(name);
      },
    }) as GPUBuffer;
  const uploader = new WebGPUBatchUploader({} as GPUDevice);
  uploader.destroy([
    {
      buffer: buffer("positions"),
      residualBuffer: buffer("residual"),
      indexBuffer: buffer("indices"),
      colorBuffer: buffer("color"),
      count: 1,
      layer: 0,
      category: "zone",
    },
    {
      buffer: buffer("borrowed"),
      residualBuffer: buffer("borrowed-low"),
      count: 1,
      layer: 0,
      category: "zone",
      borrowed: true,
    },
  ] as never);
  expect(destroyed).toStrictEqual([
    "positions",
    "residual",
    "indices",
    "color",
  ]);
});

test("scene upload applies the requested color mode to the GPU zone color buffer", () => {
  const previous = (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage;
  (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage = {
    VERTEX: 1,
    INDEX: 2,
  };
  const device = {
    limits: { maxBufferSize: 1_000_000 },
    createBuffer: ({ size }: { size: number }) => {
      const bytes = new ArrayBuffer(size);
      return { bytes, getMappedRange: () => bytes, unmap() {}, destroy() {} };
    },
  } as unknown as GPUDevice;
  const scene: BoardScene = {
    layers: [{ id: 0, name: "TOP", color: "#4080c0" }],
    nets: new Map([[1, "GND"]]),
    segments: [],
    pins: [],
    vias: [],
    texts: [],
    drawingLayers: [],
    outline: [],
    diagnostics: [],
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    zones: [
      {
        id: 1,
        net: 1,
        layer: 0,
        paths: [],
        rings: [],
        points: new Float64Array([0, 0, 1, 0, 0, 1]),
        indices: new Uint32Array([0, 1, 2]),
        outerCount: 3,
      },
    ],
  };
  try {
    const [zone] = new WebGPUBatchUploader(device).upload(scene, {
      kind: "scene",
      colorMode: "net",
    });
    const buffer = zone.colorBuffer as GPUBuffer & { bytes: ArrayBuffer };
    expect([...new Float32Array(buffer.bytes)]).toEqual([
      Math.fround(26 / 255),
      Math.fround(58 / 255),
      Math.fround(95 / 255),
      1,
    ]);
  } finally {
    (globalThis as { GPUBufferUsage?: unknown }).GPUBufferUsage = previous;
  }
});
