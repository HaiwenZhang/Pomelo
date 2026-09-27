import type { Point } from "../../board/model";
import type { PadsPlacement } from "../binary/metadata";
/** PADS bottom-side orientation reflects the already rotated local X axis.
 * It is equivalent to mirroring local X then rotating by the negative angle. */
export function padsPlacePoint(
  point: Point,
  placement: Pick<PadsPlacement, "at" | "angle" | "bottom">,
): Point {
  const cos = Math.cos(placement.angle),
    sin = Math.sin(placement.angle);
  const x = point[0] * cos - point[1] * sin,
    y = point[0] * sin + point[1] * cos;
  return [placement.at[0] + (placement.bottom ? -x : x), placement.at[1] + y];
}
