import type {
  BoardDrawing,
  BoardText,
  Point,
  Segment,
} from "../../board/model";
import { ArcShape } from "../../board/shapes/arc";
import type { Raw } from "../binary/reader";
import type { BrdDatabase } from "../database";
import { cooperative } from "../../cooperative";
import { parserError } from "../../parser-error";
export const DIMENSION_LAYER = 0x10000 + 0xf901;
export class AllegroDrawingBuilder {
  constructor(
    readonly database: BrdDatabase,
    readonly scale: number,
  ) {}
  /** Only stored Dimension graphics. Never reconstruct arrows or dimension values
   * from settings, and never apply a second transform to placed-symbol geometry. */
  async build(
    candidates: readonly Raw[],
    texts: readonly BoardText[],
    diagnostics: string[],
    signal?: AbortSignal,
  ): Promise<BoardDrawing[]> {
    const db = this.database;
    const scale = this.scale;
    const checkpoint = cooperative(signal),
      selected = new Map(candidates.map((g) => [g.Key, g]));
    const owners = new Map<number, Raw>(),
      accepted = new Set<number>(),
      groups = new Map<number, BoardDrawing>();
    const pause = async () => {
      const pending = checkpoint();
      if (pending) await pending;
    };
    for (const graphic of candidates) {
      const owner = db.get(graphic.Parent);
      if (owner?.type === 0x2d) owners.set(owner.Key, owner);
      await pause();
    }
    for (const text of texts)
      if (text.layer === DIMENSION_LAYER && text.ownerId !== undefined) {
        const owner = db.get(text.ownerId);
        if (owner?.type === 0x2d) owners.set(owner.Key, owner);
      }
    function group(id: number, ownerId?: number) {
      let result = groups.get(id);
      if (!result) {
        result = {
          id,
          layer: DIMENSION_LAYER,
          net: 0,
          graphicIds: [],
          segments: [],
          texts: [],
          ...(ownerId === undefined ? {} : { ownerId }),
        };
        groups.set(id, result);
      }
      return result;
    }
    async function append(graphic: Raw, ownerId?: number) {
      if (accepted.has(graphic.Key)) return;
      accepted.add(graphic.Key);
      const drawing = group(ownerId ?? graphic.Key, ownerId),
        seen = new Set<number>();
      drawing.graphicIds.push(graphic.Key);
      let key = graphic.SegmentPtr;
      while (key && key !== graphic.Key) {
        if (seen.has(key)) {
          if (key === graphic.SegmentPtr) break; // Closed source path.
          throw parserError("brdDrawingPathChainLoop", {
            detail: graphic.Key,
            value: key,
          });
        }
        seen.add(key);
        const record = db.get(key);
        if (!record || ![1, 21, 22, 23].includes(record.type)) {
          diagnostics.push(`尺寸图形 ${graphic.Key} 缺失或无效路径引用 ${key}`);
          break;
        }
        const a: Point = [record.StartX * scale, record.StartY * scale],
          b: Point = [record.EndX * scale, record.EndY * scale];
        const segment: Segment = {
          id: record.Key,
          trackId: 0,
          layer: DIMENSION_LAYER,
          net: 0,
          a,
          b,
          width: record.Width * scale,
        };
        if (record.type === 1) {
          const center: Point = [
            record.CenterX * scale,
            record.CenterY * scale,
          ];
          const start = Math.atan2(a[1] - center[1], a[0] - center[0]),
            end = Math.atan2(b[1] - center[1], b[0] - center[0]);
          segment.arc = {
            center,
            radius: Math.hypot(a[0] - center[0], a[1] - center[1]),
            start,
            sweep: ArcShape.sweep(start, end, (record.SubType & 64) !== 0),
          };
        }
        if (
          ![
            ...a,
            ...b,
            segment.width,
            ...(segment.arc
              ? [
                  ...segment.arc.center,
                  segment.arc.radius,
                  segment.arc.start,
                  segment.arc.sweep,
                ]
              : []),
          ].every(Number.isFinite) ||
          segment.width < 0
        ) {
          diagnostics.push(
            `尺寸图形 ${graphic.Key} 的路径 ${key} 坐标或线宽无效`,
          );
          break;
        }
        drawing.segments.push(segment);
        key = record.Next;
        await pause();
      }
    }
    async function walk(head: number, tail: number, ownerId?: number) {
      const seen = new Set<number>();
      let key = head;
      while (key && key !== tail && !db.header.sentinelKeys?.includes(key)) {
        if (seen.has(key))
          throw parserError("brdDrawingOwnerChainLoop", { detail: key });
        seen.add(key);
        const graphic = db.get(key);
        if (graphic?.type !== 0x14) {
          diagnostics.push(`尺寸图形所属链缺失或无效引用 ${key}`);
          break;
        }
        if (selected.has(key)) {
          if (graphic.Parent !== (ownerId ?? tail))
            diagnostics.push(`尺寸图形 ${key} 所属对象与链表不一致`);
          else await append(graphic, ownerId);
        }
        key = graphic.Next;
        await pause();
      }
    }
    // Header membership identifies board graphics; a magic parent ID would fail
    // on files using pointer-valued sentinels, including V16 and V18.
    const board = db.header.graphicList;
    if (board && candidates.some((g) => g.Parent === board.tail))
      await walk(board.head, board.tail);
    for (const owner of owners.values())
      await walk(owner.GraphicPtr, owner.Key, owner.Key);
    for (const graphic of candidates) {
      if (!accepted.has(graphic.Key) && db.get(graphic.Parent)?.type !== 0x2b)
        diagnostics.push(
          `尺寸图形 ${graphic.Key} 未关联到有效板级或已放置实例链`,
        );
      await pause();
    }
    for (const text of texts) {
      if (
        text.layer === DIMENSION_LAYER &&
        text.ownerId !== undefined &&
        owners.has(text.ownerId)
      )
        group(text.ownerId, text.ownerId).texts.push(text);
      await pause();
    }
    signal?.throwIfAborted();
    return [...groups.values()];
  }
}
