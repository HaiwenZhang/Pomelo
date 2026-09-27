import { cooperative } from "../cooperative";
import type { Bounds, CopperChunk, Point, Segment } from "./model";
import { ContourShape } from "./shapes/contour";
import { PathShape } from "./shapes/path";
/** Format-independent copper mesh; coordinates are in board space. */
export class CopperMesh {
  constructor(readonly data: Point[][]) {}
  private static spreadBits(value: number) {
    value = (value | (value << 8)) & 0x00ff00ff;
    value = (value | (value << 4)) & 0x0f0f0f0f;
    value = (value | (value << 2)) & 0x33333333;
    return (value | (value << 1)) & 0x55555555;
  }
  /** Triangulate each contour independently. The GPU writes the outer coverage,
   * subtracts every hole, then shades once. Avoids earcut's expensive hole bridges
   * on planes with tens of thousands of cutouts; overlapping holes remain a union.
   * Coordinates/tolerance are unchanged from the supplied rings. */
  async build(signal?: AbortSignal, paths?: Segment[][]) {
    const rings = this.data;
    signal?.throwIfAborted();
    const vertices = rings.reduce((sum, ring) => sum + ring.length, 0);
    const points = new Float64Array(vertices * 2);
    const ringOffsets = new Uint32Array(rings.length + 1);
    const ringBounds = new Float64Array(rings.length * 4);
    const storage = new Uint32Array(
      rings.reduce((sum, ring) => sum + Math.max(0, ring.length - 2) * 3, 0),
    );
    const bounds: Bounds[] = [];
    const holeChunks: CopperChunk[] = [];
    const pauseIfNeeded = cooperative(signal, 10);
    let vertexOffset = 0,
      indexOffset = 0,
      outerCount = 0;
    for (let ringIndex = 0; ringIndex < rings.length; ringIndex++) {
      ringOffsets[ringIndex] = vertexOffset;
      const ring = rings[ringIndex],
        data = points.subarray(
          vertexOffset * 2,
          (vertexOffset + ring.length) * 2,
        );
      const box = {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      };
      for (let i = 0; i < ring.length; i++) {
        data[i * 2] = ring[i][0];
        data[i * 2 + 1] = ring[i][1];
        box.minX = Math.min(box.minX, ring[i][0]);
        box.maxX = Math.max(box.maxX, ring[i][0]);
        box.minY = Math.min(box.minY, ring[i][1]);
        box.maxY = Math.max(box.maxY, ring[i][1]);
      }
      if (paths?.[ringIndex]?.length) {
        const exact = new PathShape(paths[ringIndex]).bounds();
        box.minX = Math.min(box.minX, exact.minX);
        box.maxX = Math.max(box.maxX, exact.maxX);
        box.minY = Math.min(box.minY, exact.minY);
        box.maxY = Math.max(box.maxY, exact.maxY);
      }
      ringBounds.set([box.minX, box.minY, box.maxX, box.maxY], ringIndex * 4);
      bounds.push(box);
      vertexOffset += ring.length;
      const pause = pauseIfNeeded();
      if (pause) await pause;
    }
    ringOffsets[rings.length] = vertexOffset;
    // Reorder only hole indices, keeping source coordinates and ring offsets intact.
    // Nearby holes share a bounded draw range; at Fit adjacent ranges merge again.
    const exterior = bounds[0];
    const code = (box: Bounds) => {
      const axis = (center: number, min: number, max: number) =>
        Math.max(
          0,
          Math.min(
            65535,
            Math.floor(((center - min) / Math.max(max - min, 1e-20)) * 65535),
          ),
        );
      const x = axis((box.minX + box.maxX) / 2, exterior.minX, exterior.maxX);
      const y = axis((box.minY + box.maxY) / 2, exterior.minY, exterior.maxY);
      return (CopperMesh.spreadBits(x) | (CopperMesh.spreadBits(y) << 1)) >>> 0;
    };
    const holes = bounds
      .slice(1)
      .map((box, i) => ({ index: i + 1, code: code(box) }));
    holes.sort((a, b) => a.code - b.code);
    const order = rings.length ? [0, ...holes.map((h) => h.index)] : [];
    let chunk: CopperChunk | undefined;
    for (let position = 0; position < order.length; position++) {
      const ringIndex = order[position];
      const data = points.subarray(
        ringOffsets[ringIndex] * 2,
        ringOffsets[ringIndex + 1] * 2,
      );
      const indices = new ContourShape(data).triangulate();
      if (indexOffset + indices.length > storage.length)
        throw new Error("铜皮轮廓三角化输出超出上限");
      if (position > 0) {
        if ((position - 1) % 64 === 0) {
          chunk = {
            start: indexOffset,
            count: 0,
            ringStart: position,
            ringCount: 0,
            bounds: {
              minX: Infinity,
              minY: Infinity,
              maxX: -Infinity,
              maxY: -Infinity,
            },
          };
          holeChunks.push(chunk);
        }
        const box = bounds[ringIndex],
          target = chunk!.bounds;
        target.minX = Math.min(target.minX, box.minX);
        target.maxX = Math.max(target.maxX, box.maxX);
        target.minY = Math.min(target.minY, box.minY);
        target.maxY = Math.max(target.maxY, box.maxY);
        chunk!.count += indices.length;
        chunk!.ringCount!++;
      }
      for (const index of indices)
        storage[indexOffset++] = index + ringOffsets[ringIndex];
      if (ringIndex === 0) outerCount = indexOffset;
      const pause = pauseIfNeeded();
      if (pause) await pause;
    }
    signal?.throwIfAborted();
    return {
      points,
      indices: storage.subarray(0, indexOffset),
      outerCount,
      ringOffsets,
      holeChunks,
      ringBounds,
      ringOrder: new Uint32Array(order),
      curved: paths?.some((path) => path.some((edge) => !!edge.arc)),
    };
  }
}
