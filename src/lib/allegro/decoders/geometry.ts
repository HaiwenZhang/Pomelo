import { decodeAllegroSegment } from "./segment";
import { completeSteps, completeStepsAsync } from "../../iteration";
import type { Point, Segment } from "../../board/model";
import { PathShape } from "../../board/shapes/path";
import { isRecordType, type AllegroRecord } from "../binary/record-types";
import type { BrdDatabase } from "../database";
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
      const segment = decodeAllegroSegment(r, scale, hatch);
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
    return completeStepsAsync(this.contourSteps(source), signal, 10);
  }
}
