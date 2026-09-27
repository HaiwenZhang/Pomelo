import type { Bounds, Point, Segment } from "../board/model";
import { SegmentShape } from "../board/shapes/segment";
import type { PrimitiveBatch } from "./primitive-batch";

import { PositionPrecision } from "./position-precision";

/** Separate arcs keep compensated arithmetic and its extra attributes out of
 * the much larger straight-line/via batches. All entries have the same color,
 * so regrouping inside this layer/category preserves alpha compositing. */
export class ArcBatchBuilder {
  static build(
    meta: Pick<PrimitiveBatch, "layer" | "category" | "padMode">,
    values: number[],
  ): PrimitiveBatch[] {
    const steps = ArcBatchBuilder.buildSteps(meta, values);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value;
  }

  /** Undefined steps allow cancellation during counting and conversion, without
   * changing grouping, packet sizes, double-to-float residuals or upload order. */
  static *buildSteps(
    meta: Pick<PrimitiveBatch, "layer" | "category" | "padMode">,
    values: number[],
  ): Generator<undefined, PrimitiveBatch[]> {
    let count = 0;
    for (let i = 0; i < values.length; i += 12) {
      if (values[i + 6] === 1) count++;
      if (((i / 12) & 2047) === 2047) yield;
    }
    if (!count)
      return [
        { ...meta, ...(yield* PositionPrecision.splitSteps(values, 12, 4)) },
      ];
    const lines = {
      data: new Float32Array(values.length - count * 12),
      residual: new Float32Array((values.length / 12 - count) * 4),
    };
    const arcs = {
      data: new Float32Array(count * 20),
      residual: new Float32Array(count * 12),
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
      entry = new Float64Array(20);
    let lineIndex = 0,
      arcIndex = 0;
    for (let i = 0; i < values.length; i += 12) {
      if (i && i % (512 * 12) === 0) yield;
      if (values[i + 6] !== 1) {
        for (let j = 0; j < 12; j++)
          lines.data[lineIndex * 12 + j] = values[i + j];
        for (let j = 0; j < 4; j++)
          lines.residual[lineIndex * 4 + j] =
            values[i + j] - lines.data[lineIndex * 12 + j];
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
      arcs.data.set(entry, arcIndex * 20);
      for (let j = 0; j < 12; j++)
        arcs.residual[arcIndex * 12 + j] =
          entry[j] - arcs.data[arcIndex * 20 + j];
      arcIndex++;
    }
    const result: PrimitiveBatch[] = [];
    if (lines.data.length) result.push({ ...meta, ...lines });
    result.push({ ...meta, arcs: true, ...arcs });
    return result;
  }

  static readonly vertexBuffers: GPUVertexBufferLayout[] = [
    {
      arrayStride: 80,
      stepMode: "instance",
      attributes: Array.from({ length: 5 }, (_, i) => ({
        shaderLocation: i,
        offset: i * 16,
        format: "float32x4" as const,
      })),
    },
    {
      arrayStride: 48,
      stepMode: "instance",
      attributes: Array.from({ length: 3 }, (_, i) => ({
        shaderLocation: i + 5,
        offset: i * 16,
        format: "float32x4" as const,
      })),
    },
  ];
}
