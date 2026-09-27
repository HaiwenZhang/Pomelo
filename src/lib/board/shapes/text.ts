import type { BoardText } from "../model";
/** Format-independent text shape; coordinates are in board space. */
export class TextShape {
  constructor(
    readonly data: Pick<
      BoardText,
      "width" | "height" | "spacing" | "lineSpacing" | "strokeWidth"
    >,
  ) {}
  /** A stored zero-size text block remains a scene object but has no drawable strokes. */
  isZeroSize(): boolean {
    const text = this.data;
    return (
      text.width === 0 &&
      text.height === 0 &&
      text.spacing === 0 &&
      text.lineSpacing === 0 &&
      text.strokeWidth === 0
    );
  }
}
