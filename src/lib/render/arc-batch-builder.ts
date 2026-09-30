import { completeSteps } from "../iteration";
import { BoardDisplay } from "../board/display";
import { STROKE_PACKET, ARC_PACKET } from "./primitive-layout";
import type { Bounds, Point, Segment } from "../board/model";
import { SegmentShape } from "../board/shapes/segment";
import type { PrimitiveBatch } from "./primitive-batch";

import { splitPositionSteps } from "./position-precision";

/** Separate arcs keep compensated arithmetic and its extra attributes out of
 * the larger straight-line/via batches. Picking follows the same pass order,
 * including when overlapping strokes have different net colors. */
export function buildArcBatches(
  meta: Pick<PrimitiveBatch, "layer" | "category" | "padMode">,
  values: number[],
): PrimitiveBatch[] {
  return completeSteps(buildArcBatchSteps(meta, values));
}

/** Undefined steps allow cancellation during counting and conversion, without
 * changing grouping, packet sizes, double-to-float residuals or upload order. */
export function* buildArcBatchSteps(
  meta: Pick<PrimitiveBatch, "layer" | "category" | "padMode">,
  values: number[],
): Generator<undefined, PrimitiveBatch[]> {
  let count = 0;
  for (let i = 0; i < values.length; i += STROKE_PACKET.stride) {
    if (values[i + 6] === 1) count++;
    if (((i / STROKE_PACKET.stride) & 2047) === 2047) yield;
  }
  if (!count)
    return [
      {
        ...meta,
        ...(yield* splitPositionSteps(
          values,
          STROKE_PACKET.stride,
          STROKE_PACKET.positions,
        )),
      },
    ];
  const lines = {
    data: new Float32Array(values.length - count * STROKE_PACKET.stride),
    residual: new Float32Array(
      (values.length / STROKE_PACKET.stride - count) * STROKE_PACKET.positions,
    ),
  };
  const arcs = {
    data: new Float32Array(count * ARC_PACKET.stride),
    residual: new Float32Array(count * ARC_PACKET.positions),
  };
  // Private to this generator: no per-arc endpoint, Segment, Bounds or packet
  // allocations, and simultaneous/paused conversions cannot share scratch data.
  const arc = { center: [0, 0] as Point, radius: 0, start: 0, sweep: 0 };
  const segment: Segment = {
    id: 0,
    trackId: 0,
    layer: meta.layer,
    net: 0,
    a: [0, 0],
    b: [0, 0],
    width: 0,
    arc,
  };
  const bounds: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    entry = new Float64Array(ARC_PACKET.stride);
  let lineIndex = 0,
    arcIndex = 0;
  for (let i = 0; i < values.length; i += STROKE_PACKET.stride) {
    if (i && i % (512 * STROKE_PACKET.stride) === 0) yield;
    if (values[i + 6] !== 1) {
      for (let j = 0; j < STROKE_PACKET.stride; j++)
        lines.data[lineIndex * STROKE_PACKET.stride + j] = values[i + j];
      for (let j = 0; j < STROKE_PACKET.positions; j++)
        lines.residual[lineIndex * STROKE_PACKET.positions + j] =
          values[i + j] - lines.data[lineIndex * STROKE_PACKET.stride + j];
      lineIndex++;
      continue;
    }
    const x = values[i],
      y = values[i + 1],
      r = values[i + 2],
      start = values[i + 3],
      width = values[i + 4],
      sweep = values[i + 5],
      end = start + sweep;
    arc.center[0] = x;
    arc.center[1] = y;
    arc.radius = r;
    arc.start = start;
    arc.sweep = sweep;
    segment.width = width;
    entry[0] = x;
    entry[1] = y;
    entry[2] = r;
    entry[3] = width;
    entry[4] = segment.a[0] = x + r * Math.cos(start);
    entry[5] = segment.a[1] = y + r * Math.sin(start);
    entry[6] = segment.b[0] = x + r * Math.cos(end);
    entry[7] = segment.b[1] = y + r * Math.sin(end);
    new SegmentShape(segment).bounds(bounds);
    entry[8] = bounds.minX;
    entry[9] = bounds.minY;
    entry[10] = bounds.maxX;
    entry[11] = bounds.maxY;
    for (let j = 12; j < 16; j++) entry[j] = values[i + j - 4];
    entry[16] = Math.sign(sweep);
    entry[17] = Math.abs(sweep) > Math.PI ? 1 : 0;
    entry[18] = Math.abs(sweep) >= Math.PI * 2 ? 1 : 0;
    arcs.data.set(entry, arcIndex * ARC_PACKET.stride);
    for (let j = 0; j < ARC_PACKET.positions; j++)
      arcs.residual[arcIndex * ARC_PACKET.positions + j] =
        entry[j] - arcs.data[arcIndex * ARC_PACKET.stride + j];
    arcIndex++;
  }
  const result: PrimitiveBatch[] = [];
  for (const pass of BoardDisplay.segmentPasses) {
    const packet = pass === "arc" ? arcs : lines;
    if (packet.data.length)
      result.push({
        ...meta,
        ...packet,
        ...(pass === "arc" ? { arcs: true } : {}),
      });
  }
  return result;
}

export const arcVertexBuffers: GPUVertexBufferLayout[] = [
  {
    arrayStride: ARC_PACKET.stride * Float32Array.BYTES_PER_ELEMENT,
    stepMode: "instance",
    attributes: Array.from({ length: 5 }, (_, i) => ({
      shaderLocation: i,
      offset: i * 16,
      format: "float32x4" as const,
    })),
  },
  {
    arrayStride: ARC_PACKET.positions * Float32Array.BYTES_PER_ELEMENT,
    stepMode: "instance",
    attributes: Array.from({ length: 3 }, (_, i) => ({
      shaderLocation: i + 5,
      offset: i * 16,
      format: "float32x4" as const,
    })),
  },
];
