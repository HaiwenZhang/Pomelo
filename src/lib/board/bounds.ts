import type {
  Bounds,
  PadShape as PadData,
  Point,
  Segment,
  Zone,
} from "./model";
import { DrillShape } from "./shapes/drill";
import { PadShape, type PadOwner } from "./shapes/pad";
import { SegmentShape } from "./shapes/segment";
import { ZoneShape } from "./shapes/zone";

/** One build owns its accumulated bounds and reusable geometry scratch box.
 * Callers decide which objects belong in board-fit versus document extents. */
export class BoundsAccumulator {
  readonly bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  private readonly scratch: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  get finite(): boolean {
    const b = this.bounds;
    return (
      Number.isFinite(b.minX) &&
      Number.isFinite(b.minY) &&
      Number.isFinite(b.maxX) &&
      Number.isFinite(b.maxY) &&
      b.minX <= b.maxX &&
      b.minY <= b.maxY
    );
  }

  /** Ignore the empty sentinel produced by builders with no accepted objects. */
  include = (box: Bounds): void => {
    const b = this.bounds;
    b.minX = Math.min(b.minX, box.minX);
    b.minY = Math.min(b.minY, box.minY);
    b.maxX = Math.max(b.maxX, box.maxX);
    b.maxY = Math.max(b.maxY, box.maxY);
  };

  includePoint = (point: Point, radius = 0): void => {
    const b = this.bounds;
    b.minX = Math.min(b.minX, point[0] - radius);
    b.minY = Math.min(b.minY, point[1] - radius);
    b.maxX = Math.max(b.maxX, point[0] + radius);
    b.maxY = Math.max(b.maxY, point[1] + radius);
  };

  includeSegment = (segment: Segment): void => {
    this.include(new SegmentShape(segment).bounds(this.scratch));
  };

  includePad(owner: PadOwner, pad: PadData): void {
    this.include(new PadShape(pad).bounds(owner, this.scratch));
  }

  includePadOwner = (owner: PadOwner): void => {
    for (const pad of "shapes" in owner ? owner.shapes : owner.pads)
      this.includePad(owner, pad);
    const hole = new DrillShape(owner).pad();
    if (hole) this.includePad(owner, hole);
  };

  includeZone = (zone: Zone): void => {
    this.include(new ZoneShape(zone).bounds());
  };

  /** Keep the published bounds object when changing the initial-fit range. */
  reset(box?: Bounds): void {
    Object.assign(
      this.bounds,
      box ?? {
        minX: Infinity,
        minY: Infinity,
        maxX: -Infinity,
        maxY: -Infinity,
      },
    );
  }
}
