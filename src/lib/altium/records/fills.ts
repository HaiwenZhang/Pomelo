import type { Point } from "../../board/model";
import { AltiumBinaryReader } from "../binary/binary-records";
import { ALTIUM_MM } from "./primitives";
export interface AltiumFill {
  index: number;
  layer: number;
  net: number;
  component: number;
  keepout: boolean;
  a: Point;
  b: Point;
  angle: number;
}
export class AltiumFillReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly count: number,
  ) {}
  *records(): Generator<AltiumFill> {
    const { data, count } = this;
    for (const record of new AltiumBinaryReader(data, 6, 1, count).records()) {
      const body = record.parts[0];
      if (body.length < 37)
        throw new Error(`Altium Fill ${record.index} 长度不足`);
      const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
      const point = (at: number): Point => [
        view.getInt32(at, true) * ALTIUM_MM,
        -view.getInt32(at + 4, true) * ALTIUM_MM,
      ];
      const fill: AltiumFill = {
        index: record.index,
        layer: body[0],
        net: view.getUint16(3, true),
        component: view.getUint16(7, true),
        keepout: body[2] === 2,
        a: point(13),
        b: point(21),
        angle: (-view.getFloat64(29, true) * Math.PI) / 180,
      };
      if (![...fill.a, ...fill.b, fill.angle].every(Number.isFinite))
        throw new Error(`Altium Fill ${record.index} 几何无效`);
      yield fill;
    }
  }
}
/** Compatibility entry point; parsing state belongs to AltiumFillReader. */
export function* altiumFills(
  data: Uint8Array,
  count: number,
): Generator<AltiumFill> {
  yield* new AltiumFillReader(data, count).records();
}
