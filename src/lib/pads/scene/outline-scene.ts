import type { Segment } from "../../board/model";
import { cooperative } from "../../cooperative";
import { PADS_BASIC_TO_MM } from "../binary/metadata";
import type { readPadsOutlines } from "../binary/outlines";
type Source = Awaited<ReturnType<typeof readPadsOutlines>>;
/** Convert only dedicated board-outline pieces. Arc boxes are owner-relative
 * full-circle bounds; the fifth word resolves the direction of a 180° sweep. */
export class PadsOutlineBuilder {
  constructor(private readonly source: Source) {}
  async build(signal?: AbortSignal): Promise<Segment[]> {
    const { source } = this;
    signal?.throwIfAborted();
    const owners = new Map(source.owners.map((owner) => [owner.index, owner]));
    const segments: Segment[] = [],
      pause = cooperative(signal);
    for (const outline of source.outlines) {
      const pending = pause();
      if (pending) await pending;
      const owner = owners.get(outline.owner);
      if (!owner || !Number.isFinite(outline.width) || outline.width < 0)
        throw new Error(`PADS 板框归属或宽度无效 ${outline.owner}`);
      const vertices = outline.vertices;
      if (vertices.length < 2)
        throw new Error(`PADS 板框缺少线段 ${outline.piece}`);
      for (let i = 0; i < vertices.length - 1; i++) {
        const a = vertices[i],
          b = vertices[i + 1];
        if (![...a.at, ...b.at].every(Number.isFinite))
          throw new Error(`PADS 板框坐标无效 ${outline.piece}`);
        const segment: Segment = {
          id: 0x60000000 + segments.length,
          trackId: 0x58000000 + outline.piece,
          layer: -1,
          net: 0,
          a: a.at,
          b: b.at,
          width: outline.width,
        };
        if (a.arcBox) {
          const [xmin, ymin, xmax, ymax, direction] = a.arcBox;
          if (
            ![xmin, ymin, xmax, ymax, direction].every(Number.isFinite) ||
            xmax <= xmin ||
            ymax <= ymin
          )
            throw new Error(`PADS 板框圆弧包围盒无效 ${outline.piece}`);
          const center: [number, number] = [
            ((xmin + xmax) / 2 + owner.origin[0]) * PADS_BASIC_TO_MM,
            ((ymin + ymax) / 2 + owner.origin[1]) * PADS_BASIC_TO_MM,
          ];
          const radius = ((xmax - xmin) / 2) * PADS_BASIC_TO_MM,
            ry = ((ymax - ymin) / 2) * PADS_BASIC_TO_MM;
          if (
            Math.abs(radius - ry) > 0.01 ||
            Math.abs(
              Math.hypot(a.at[0] - center[0], a.at[1] - center[1]) - radius,
            ) > 0.01 ||
            Math.abs(
              Math.hypot(b.at[0] - center[0], b.at[1] - center[1]) - radius,
            ) > 0.01
          )
            throw new Error(`PADS 板框圆弧半径不一致 ${outline.piece}`);
          const start = Math.atan2(a.at[1] - center[1], a.at[0] - center[0]),
            end = Math.atan2(b.at[1] - center[1], b.at[0] - center[0]);
          let sweep = end - start;
          while (sweep > Math.PI) sweep -= Math.PI * 2;
          while (sweep <= -Math.PI) sweep += Math.PI * 2;
          if (Math.abs(Math.abs(sweep) - Math.PI) < 1e-7 && direction !== 0)
            sweep = Math.sign(direction) * Math.PI;
          if (Math.abs(sweep) < 1e-9)
            throw new Error(`PADS 板框整圆圆弧尚未解析 ${outline.piece}`);
          segment.arc = { center, radius, start, sweep };
        } else if (a.at[0] === b.at[0] && a.at[1] === b.at[1]) continue;
        segments.push(segment);
        if (segments.length % 512 === 0) {
          const next = pause();
          if (next) await next;
        }
      }
    }
    return segments;
  }
}
/** Compatibility entry point; parsing state belongs to PadsOutlineBuilder. */
export async function buildPadsOutlineSegments(
  source: Source,
  signal?: AbortSignal,
): Promise<Segment[]> {
  return new PadsOutlineBuilder(source).build(signal);
}
