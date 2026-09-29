import { decodeAllegroSegment } from "../decoders/segment";
import type { BoardDrawing, BoardText } from "../../board/model";
import { isRecordType, type AllegroRecord } from "../binary/record-types";
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
    candidates: readonly AllegroRecord<0x14>[],
    texts: readonly BoardText[],
    diagnostics: string[],
    signal?: AbortSignal,
  ): Promise<BoardDrawing[]> {
    const db = this.database;
    const scale = this.scale;
    const checkpoint = cooperative(signal),
      selected = new Map(candidates.map((g) => [g.Key, g]));
    const owners = new Map<number, AllegroRecord<0x2d>>(),
      accepted = new Set<number>(),
      groups = new Map<number, BoardDrawing>();
    for (const graphic of candidates) {
      const owner = db.get(graphic.Parent);
      if (isRecordType(owner, 0x2d)) owners.set(owner.Key, owner);
      const pause = checkpoint();
      if (pause) await pause;
    }
    for (const text of texts)
      if (text.layer === DIMENSION_LAYER && text.ownerId !== undefined) {
        const owner = db.get(text.ownerId);
        if (isRecordType(owner, 0x2d)) owners.set(owner.Key, owner);
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
    async function append(graphic: AllegroRecord<0x14>, ownerId?: number) {
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
        if (!record || !isRecordType(record, [1, 21, 22, 23] as const)) {
          diagnostics.push(`尺寸图形 ${graphic.Key} 缺失或无效路径引用 ${key}`);
          break;
        }
        const segment = decodeAllegroSegment(record, scale);
        segment.layer = DIMENSION_LAYER;
        if (
          ![
            ...segment.a,
            ...segment.b,
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
        const pause = checkpoint();
        if (pause) await pause;
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
        if (!isRecordType(graphic, 0x14)) {
          diagnostics.push(`尺寸图形所属链缺失或无效引用 ${key}`);
          break;
        }
        if (selected.has(key)) {
          if (graphic.Parent !== (ownerId ?? tail))
            diagnostics.push(`尺寸图形 ${key} 所属对象与链表不一致`);
          else await append(graphic, ownerId);
        }
        key = graphic.Next;
        const pause = checkpoint();
        if (pause) await pause;
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
      const pause = checkpoint();
      if (pause) await pause;
    }
    for (const text of texts) {
      if (
        text.layer === DIMENSION_LAYER &&
        text.ownerId !== undefined &&
        owners.has(text.ownerId)
      )
        group(text.ownerId, text.ownerId).texts.push(text);
      const pause = checkpoint();
      if (pause) await pause;
    }
    signal?.throwIfAborted();
    return [...groups.values()];
  }
}
