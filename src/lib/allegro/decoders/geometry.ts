import { BoardIteration } from "../../board/iteration";
import type { Point, Segment } from "../../board/model";
import { ArcShape } from "../../board/shapes/arc";
import { PathShape } from "../../board/shapes/path";
import type { BrdDatabase } from "../database";
import { cooperative } from "../../cooperative";
export class AllegroGeometryDecoder {
  constructor(
    readonly database: BrdDatabase,
    readonly scale: number,
  ) {}
  readPath(first: number): Segment[] {
    return BoardIteration.complete(this.readPathSteps(first));
  }
  private *readPathSteps(first: number): Generator<void, Segment[]> {
    const db = this.database;
    const scale = this.scale;
    const result: Segment[] = [],
      seen = new Set<number>();
    let key = first;
    while (key) {
      if (seen.has(key)) {
        if (key === first) break;
        throw new Error(`路径链循环 ${key}`);
      }
      seen.add(key);
      const r = db.get(key);
      if (!r || ![1, 21, 22, 23].includes(r.type)) break;
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
        const center: Point = [r.CenterX * scale, r.CenterY * scale],
          radius = Math.hypot(a[0] - center[0], a[1] - center[1]);
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
  private *shapePathSteps(id: number): Generator<Segment[] | void> {
    const db = this.database;
    const shape = db.get(id);
    if (shape?.type !== 40) return;
    const outer = yield* this.readPathSteps(shape.FirstSegmentPtr);
    if (outer.length) yield outer;
    const seen = new Set<number>();
    let key = shape.FirstKeepoutPtr;
    while (key) {
      const hole = db.get(key);
      if (hole?.type !== 52) break;
      if (seen.has(key)) throw new Error(`铜皮孔洞链循环 ${key}`);
      seen.add(key);
      const path = yield* this.readPathSteps(hole.FirstSegmentPtr);
      if (path.length) yield path;
      key = hole.Next;
      if ((seen.size & 255) === 0) yield;
    }
  }
  private *contourSteps(id: number) {
    const paths: Segment[][] = [],
      rings: Point[][] = [];
    for (const path of this.shapePathSteps(id)) {
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
  async readContours(id: number, signal?: AbortSignal) {
    const pauseIfNeeded = cooperative(signal, 10),
      steps = this.contourSteps(id);
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
