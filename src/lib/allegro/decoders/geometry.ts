import { completeSteps } from "../../iteration";
import type { Point, Segment } from "../../board/model";
import { ArcShape } from "../../board/shapes/arc";
import { PathShape } from "../../board/shapes/path";
import { isRecordType, type AllegroRecord } from "../binary/record-types";
import type { BrdDatabase } from "../database";
import { cooperative } from "../../cooperative";
import { parserError } from "../../parser-error";
type ShapeContourSource = Pick<
  AllegroRecord<0x28>,
  "Key" | "FirstSegmentPtr" | "FirstKeepoutPtr"
> & { type: number };
export class AllegroGeometryDecoder {
  constructor(
    readonly database: BrdDatabase,
    readonly scale: number,
  ) {}
  readPath(first: number, hatch = false): Segment[] {
    return completeSteps(this.readPathSteps(first, hatch));
  }
  private *readPathSteps(
    first: number,
    hatch = false,
    owner?: number,
  ): Generator<void, Segment[]> {
    const db = this.database;
    const scale = this.scale;
    const result: Segment[] = [],
      seen = new Set<number>();
    let key = first;
    while (key && key !== owner) {
      if (seen.has(key)) {
        if (key === first) break;
        throw parserError("brdPathChainLoop", { detail: key });
      }
      seen.add(key);
      const r = db.get(key);
      if (!r || !isRecordType(r, [1, 21, 22, 23] as const)) break;
      const a: Point = [r.StartX * scale, r.StartY * scale],
        b: Point = [r.EndX * scale, r.EndY * scale];
      const segment: Segment = {
        id: r.Key,
        trackId: 0,
        layer: -1,
        net: 0,
        a,
        b,
        width: r.Width * scale,
      };
      if (r.type === 1) {
        const roundGrid = (value: number) => {
          const lower = Math.floor(value);
          return value - lower === 0.5
            ? lower % 2 === 0
              ? lower
              : lower + 1
            : Math.round(value);
        };
        const center: Point = [
          (hatch ? roundGrid(r.CenterX) : r.CenterX) * scale,
          (hatch ? roundGrid(r.CenterY) : r.CenterY) * scale,
        ];
        const radius = hatch
          ? (Math.hypot(a[0] - center[0], a[1] - center[1]) +
              Math.hypot(b[0] - center[0], b[1] - center[1])) /
            2
          : Math.hypot(a[0] - center[0], a[1] - center[1]);
        const start = Math.atan2(a[1] - center[1], a[0] - center[0]),
          end = Math.atan2(b[1] - center[1], b[0] - center[0]);
        segment.arc = {
          center,
          radius,
          start,
          sweep: ArcShape.sweep(start, end, (r.SubType & 64) !== 0),
        };
      }
      result.push(segment);
      key = r.Next;
      if ((result.length & 255) === 0) yield;
    }
    return result;
  }
  readShapePaths(id: number): Segment[][] {
    const rings: Segment[][] = [];
    for (const path of this.shapePathSteps(id)) if (path) rings.push(path);
    return rings;
  }
  /** Undefined yields are bounded checkpoints inside long paths or empty hole chains. */
  private *shapePathSteps(
    source: number | ShapeContourSource,
  ): Generator<Segment[] | void> {
    const db = this.database;
    const id = typeof source === "number" ? source : source.Key;
    // Zero-key records remain in byType but are not indexed by the parser.
    // Preserve the ID lookup semantics before reusing a supplied record.
    const shape = typeof source === "number" || id === 0 ? db.get(id) : source;
    if (!isRecordType(shape, 0x28)) return;
    // Owner links terminate a path. Their record has already been decoded here;
    // do not allocate and decode it again just to rediscover its non-edge type.
    const outer = yield* this.readPathSteps(shape.FirstSegmentPtr, false, id);
    if (outer.length) yield outer;
    const seen = new Set<number>();
    let key = shape.FirstKeepoutPtr;
    while (key && key !== id) {
      const hole = db.get(key);
      if (!isRecordType(hole, 0x34)) break;
      if (seen.has(key)) throw parserError("brdHoleChainLoop", { detail: key });
      seen.add(key);
      const path = yield* this.readPathSteps(hole.FirstSegmentPtr, false, key);
      if (path.length) yield path;
      key = hole.Next;
      if ((seen.size & 255) === 0) yield;
    }
  }
  private *contourSteps(source: number | ShapeContourSource) {
    const paths: Segment[][] = [],
      rings: Point[][] = [];
    for (const path of this.shapePathSteps(source)) {
      if (path) {
        const ring = yield* new PathShape(path).flattenSteps();
        if (ring.length >= 3) {
          paths.push(path);
          rings.push(ring);
        }
      }
      yield;
    }
    return { paths, rings };
  }
  /** Stored copper contours, including holes, with main-thread cancellation checkpoints.
   * Shares the synchronous readers and identical chord tolerance/point ordering. */
  async readContours(
    source: number | ShapeContourSource,
    signal?: AbortSignal,
  ) {
    const pauseIfNeeded = cooperative(signal, 10),
      steps = this.contourSteps(source);
    signal?.throwIfAborted();
    try {
      let step = steps.next();
      while (!step.done) {
        const pause = pauseIfNeeded();
        if (pause) await pause;
        step = steps.next();
      }
      return step.value;
    } finally {
      steps.return({ paths: [], rings: [] });
    }
  }
}
