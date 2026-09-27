import type { Point } from "../../board/model";
import { AltiumBinaryReader } from "../binary/binary-records";
import { ALTIUM_MM } from "./primitives";
export interface AltiumRegion {
  index: number;
  layer: number;
  net: number;
  polygon: number;
  component: number;
  keepout: boolean;
  kind: number;
  boardCutout: boolean;
  outline: Point[];
  holes: Point[][];
}
const latin1 = new TextDecoder("latin1");
/** Regions6 stores already poured copper as double-precision source units.
 * Each record has one subrecord with a property block and explicit hole rings. */
export class AltiumRegionReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly count: number,
  ) {}
  *records(): Generator<AltiumRegion> {
    const { data, count } = this;
    for (const record of new AltiumBinaryReader(data, 11, 1, count).records()) {
      const bytes = record.parts[0],
        view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (bytes.length < 26)
        throw new Error(`Altium Region ${record.index} 长度不足`);
      const propertyWord = view.getUint32(18, true),
        propertyLength = propertyWord & 0xffffff;
      if (propertyWord >>> 24 || propertyLength > bytes.length - 22)
        throw new Error(`Altium Region ${record.index} 属性块无效`);
      const fields = new Map<string, string>();
      for (const item of latin1
        .decode(bytes.subarray(22, 22 + propertyLength))
        .split(/[|\0]/)) {
        const at = item.indexOf("=");
        if (at >= 0)
          fields.set(item.slice(0, at).toUpperCase(), item.slice(at + 1));
      }
      if (!fields.size)
        throw new Error(`Altium Region ${record.index} 缺少属性`);
      const kind = Number(fields.get("KIND") ?? 0),
        holeCount = view.getUint16(14, true);
      if (!Number.isSafeInteger(kind))
        throw new Error(`Altium Region ${record.index} KIND 无效`);
      let at = 22 + propertyLength;
      const points = (): Point[] => {
        if (at + 4 > bytes.length)
          throw new Error(`Altium Region ${record.index} 顶点数量截断`);
        const count = view.getUint32(at, true);
        at += 4;
        if (count > (bytes.length - at) / 16)
          throw new Error(`Altium Region ${record.index} 顶点数据截断`);
        const ring: Point[] = [];
        for (let i = 0; i < count; i++, at += 16) {
          const x = view.getFloat64(at, true) * ALTIUM_MM,
            y = -view.getFloat64(at + 8, true) * ALTIUM_MM;
          if (!Number.isFinite(x) || !Number.isFinite(y))
            throw new Error(`Altium Region ${record.index} 坐标无效`);
          ring.push([x, y]);
        }
        if (
          ring.length > 1 &&
          Math.hypot(
            ring[0][0] - ring.at(-1)![0],
            ring[0][1] - ring.at(-1)![1],
          ) < 1e-8
        )
          ring.pop();
        return ring;
      };
      const outline = points(),
        holes: Point[][] = [];
      for (let i = 0; i < holeCount; i++) holes.push(points());
      if (at !== bytes.length)
        throw new Error(
          `Altium Region ${record.index} 剩余 ${bytes.length - at} 字节`,
        );
      yield {
        index: record.index,
        layer: bytes[0],
        net: view.getUint16(3, true),
        polygon: view.getUint16(5, true),
        component: view.getUint16(7, true),
        keepout: bytes[2] === 2 || fields.get("LAYER") === "KEEPOUT",
        kind,
        boardCutout: fields.get("ISBOARDCUTOUT") === "TRUE",
        outline,
        holes,
      };
    }
  }
}
/** Compatibility entry point; parsing state belongs to AltiumRegionReader. */
export function* altiumRegions(
  data: Uint8Array,
  count: number,
): Generator<AltiumRegion> {
  yield* new AltiumRegionReader(data, count).records();
}
