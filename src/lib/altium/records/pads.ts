import type { Point } from "../../board/model";
import { AltiumBinaryReader } from "../binary/binary-records";
import { ALTIUM_MM } from "./primitives";
export interface AltiumPadGeometry {
  shape: number;
  width: number;
  height: number;
}
export interface AltiumPad {
  index: number;
  name: string;
  layer: number;
  net: number;
  component: number;
  at: Point;
  angle: number;
  top: AltiumPadGeometry;
  middle: AltiumPadGeometry;
  bottom: AltiumPadGeometry;
  drill: number;
  plated: boolean;
  mode: number;
  holeRotation: number;
  inner: AltiumPadGeometry[];
  holeShape: number;
  slotSize: number;
  slotRotation: number;
  holeOffsets: Point[];
  altShapes: number[];
  cornerRadii: number[];
}
const latin1 = new TextDecoder("latin1");
const size = (d: DataView, offset: number) => ({
  width: d.getInt32(offset, true) * ALTIUM_MM,
  height: d.getInt32(offset + 4, true) * ALTIUM_MM,
});
/** Pads6 has six length-delimited subrecords. The fifth stores placement and
 * nominal padstack; the sixth optionally stores per-layer shape and slot data. */
export class AltiumPadReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly count: number,
  ) {}
  *records(): Generator<AltiumPad> {
    const { data, count } = this;
    for (const record of new AltiumBinaryReader(data, 2, 6, count).records()) {
      const [nameBytes, , , , body, extended] = record.parts;
      if (nameBytes.length < 1 || nameBytes[0] !== nameBytes.length - 1)
        throw new Error(`Altium Pad ${record.index} 名称字段长度无效`);
      if (body.length < 110)
        throw new Error(`Altium Pad ${record.index} 主记录长度不足`);
      const d = new DataView(body.buffer, body.byteOffset, body.byteLength),
        top = size(d, 21),
        middle = size(d, 29),
        bottom = size(d, 37);
      const source: AltiumPad = {
        index: record.index,
        name: latin1.decode(nameBytes.subarray(1)),
        layer: d.getUint8(0),
        net: d.getUint16(3, true),
        component: d.getUint16(7, true),
        at: [
          d.getInt32(13, true) * ALTIUM_MM,
          -d.getInt32(17, true) * ALTIUM_MM,
        ],
        angle: d.getFloat64(52, true),
        top: { shape: d.getUint8(49), ...top },
        middle: { shape: d.getUint8(50), ...middle },
        bottom: { shape: d.getUint8(51), ...bottom },
        drill: d.getInt32(45, true) * ALTIUM_MM,
        plated: d.getUint8(60) !== 0,
        mode: d.getUint8(62),
        holeRotation: body.length >= 114 ? d.getFloat64(106, true) : 0,
        inner: [],
        holeShape: 0,
        slotSize: 0,
        slotRotation: 0,
        holeOffsets: [],
        altShapes: [],
        cornerRadii: [],
      };
      if (extended.length >= 596) {
        const ex = new DataView(
          extended.buffer,
          extended.byteOffset,
          extended.byteLength,
        );
        for (let i = 0; i < 29; i++)
          source.inner.push({
            width: ex.getInt32(i * 4, true) * ALTIUM_MM,
            height: ex.getInt32(116 + i * 4, true) * ALTIUM_MM,
            shape: ex.getUint8(232 + i),
          });
        source.holeShape = ex.getUint8(262);
        source.slotSize = ex.getInt32(263, true) * ALTIUM_MM;
        source.slotRotation = ex.getFloat64(267, true);
        for (let i = 0; i < 32; i++)
          source.holeOffsets.push([
            ex.getInt32(275 + i * 4, true) * ALTIUM_MM,
            -ex.getInt32(403 + i * 4, true) * ALTIUM_MM,
          ]);
        for (let i = 0; i < 32; i++) {
          source.altShapes.push(ex.getUint8(532 + i));
          source.cornerRadii.push(ex.getUint8(564 + i));
        }
      } else if (extended.length !== 0)
        throw new Error(
          `Altium Pad ${record.index} 扩展记录长度未支持 ${extended.length}`,
        );
      yield source;
    }
  }
}
/** Compatibility entry point; parsing state belongs to AltiumPadReader. */
export function* altiumPads(
  data: Uint8Array,
  count: number,
): Generator<AltiumPad> {
  yield* new AltiumPadReader(data, count).records();
}
