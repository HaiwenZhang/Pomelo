import type { PadShape } from "../../board/model";
import type { Point } from "../../board/model";
import { PadShape as BoardPadShape } from "../../board/shapes/pad";
import type { PadsPadstack, PadsPadLayer } from "../binary/padstack";
/** Local copper only: drill/plating, physical layer mapping and instance
 * transforms are separate. Unknown codes never fall back to a round pad. */
export function padsPadGeometry(
  stack: PadsPadstack,
  layer: number,
  override?: PadsPadLayer,
) {
  if (!stack.active) throw new Error("PADS 未活动焊盘定义");
  const code = override?.shapeCode ?? stack.shapeCode,
    a = override?.width ?? stack.width;
  const second = override ? override.second : stack.fingerLength;
  if (![0, 1, 2, 3, 4].includes(code))
    throw new Error(`PADS 焊盘形状 ${code} 尚待核验`);
  if (!Number.isFinite(a) || a < 0 || !Number.isFinite(second) || second < 0)
    throw new Error("PADS 焊盘尺寸无效");
  if (a === 0) return null;
  // Code 4 uses the second dimension as the annulus inner diameter.
  // Verified against six pc_4_layers pins and 18 exported ODB++ donuts.
  if (code === 4) {
    if (second <= 0 || second >= a) throw new Error("PADS 圆环焊盘内径无效");
    const shape: PadShape = {
      layer,
      type: 25,
      width: a,
      height: a,
      offset: [0, 0],
      innerDiameter: second,
    };
    return {
      shape,
      rotation: 0,
      localOffset: [0, 0] as Point,
      paths: new BoardPadShape(shape).paths(),
    };
  }
  const finger = code === 0 || code === 1,
    b = finger && second > 0 ? second : a;
  if (!Number.isFinite(stack.fingerOffset))
    throw new Error("PADS 焊盘偏移无效");
  const shape: PadShape = {
    layer,
    type: code === 2 ? 2 : code === 0 ? 11 : 5,
    width: b,
    height: a,
    offset: [0, 0],
  };
  // The signed field once called "corner" is a center displacement along
  // the unrotated finger's long X axis. Keep it separate from BoardScene's
  // world-space shape.offset; placement must rotate/reflect this vector.
  const localOffset: Point = [finger ? stack.fingerOffset : 0, 0];
  return {
    shape,
    rotation: finger ? stack.angle : 0,
    localOffset,
    paths: new BoardPadShape(shape).paths(),
  };
}
