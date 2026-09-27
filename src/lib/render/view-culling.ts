import type { Bounds } from "../board/model";
import type { CopperChunk } from "../board/model";

export class ViewCulling {
  static overlaps(a: Bounds, b: Bounds) {
    return (
      a.minX <= b.maxX &&
      a.maxX >= b.minX &&
      a.minY <= b.maxY &&
      a.maxY >= b.minY
    );
  }

  /** Merge contiguous visible index ranges to avoid extra draw calls at board fit. */
  static *visibleCopperRanges(chunks: CopperChunk[], view: Bounds) {
    let start = 0,
      count = 0;
    for (const chunk of chunks) {
      if (!chunk.count) continue;
      if (ViewCulling.overlaps(chunk.bounds, view)) {
        if (count && start + count !== chunk.start) {
          yield { start, count };
          count = 0;
        }
        if (!count) start = chunk.start;
        count += chunk.count;
      }
    }
    if (count) yield { start, count };
  }
}
