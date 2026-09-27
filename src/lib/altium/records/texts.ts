import type { Point } from "../../board/model";
import { AltiumBinaryReader } from "../binary/binary-records";
import { ALTIUM_MM } from "./primitives";
const latin1 = new TextDecoder("latin1"),
  utf16 = new TextDecoder("utf-16le", { fatal: true });
export interface AltiumText {
  index: number;
  layer: number;
  component: number;
  at: Point;
  height: number;
  strokeWidth: number;
  angle: number;
  mirrored: boolean;
  fontIndex: number;
  fontType: number;
  text: string;
}
/** WideStrings6 is a sequence of ordinal, byte length and UTF-16LE data. */
export class AltiumWideStringReader {
  constructor(private readonly data: Uint8Array) {}
  read(): Map<number, string> {
    const { data } = this;
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength),
      table = new Map<number, string>();
    let at = 0;
    while (at < data.length) {
      if (at + 8 > data.length) throw new Error("Altium WideStrings6 表头截断");
      const index = view.getUint32(at, true),
        length = view.getUint32(at + 4, true);
      at += 8;
      if (table.has(index))
        throw new Error(`Altium WideStrings6 重复编号 ${index}`);
      if (length > 2) {
        if (length > data.length - at || length % 2)
          throw new Error(`Altium WideStrings6 项 ${index} 长度无效`);
        const bytes = data.subarray(at, at + length);
        table.set(index, utf16.decode(bytes.subarray(0, bytes.length - 2)));
        at += length;
      } else table.set(index, "");
    }
    return table;
  }
}
/** Compatibility entry point; parsing state belongs to AltiumWideStringReader. */
export function readAltiumWideStrings(data: Uint8Array): Map<number, string> {
  return new AltiumWideStringReader(data).read();
}
/** Texts6 uses a binary placement record and a length-prefixed legacy string.
 * The Unicode table wins when the saved ordinal exists. */
export class AltiumTextReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly count: number,
    private readonly wide: Map<number, string>,
  ) {}
  *records(): Generator<AltiumText> {
    const { data, count, wide } = this;
    for (const record of new AltiumBinaryReader(data, 5, 2, count).records()) {
      const [body, label] = record.parts;
      if (
        body.length < 123 ||
        label.length < 1 ||
        label[0] !== label.length - 1
      )
        throw new Error(`Altium Text ${record.index} 结构无效`);
      const view = new DataView(body.buffer, body.byteOffset, body.byteLength),
        position: Point = [
          view.getInt32(13, true) * ALTIUM_MM,
          -view.getInt32(17, true) * ALTIUM_MM,
        ];
      const index = view.getUint32(115, true),
        value = wide.get(index) ?? latin1.decode(label.subarray(1));
      const source: AltiumText = {
        index: record.index,
        layer: view.getUint8(0),
        component: view.getUint16(7, true),
        at: position,
        height: view.getInt32(21, true) * ALTIUM_MM,
        strokeWidth: view.getInt32(36, true) * ALTIUM_MM,
        angle: (-view.getFloat64(27, true) * Math.PI) / 180,
        mirrored: view.getUint8(35) !== 0,
        fontIndex: view.getUint16(25, true),
        fontType: view.getUint8(43),
        text: value,
      };
      if (
        ![...position, source.height, source.strokeWidth, source.angle].every(
          Number.isFinite,
        ) ||
        source.height < 0 ||
        source.strokeWidth < 0
      )
        throw new Error(`Altium Text ${record.index} 尺寸或坐标无效`);
      yield source;
    }
  }
}
/** Compatibility entry point; parsing state belongs to AltiumTextReader. */
export function* altiumTexts(
  data: Uint8Array,
  count: number,
  wide: Map<number, string>,
): Generator<AltiumText> {
  yield* new AltiumTextReader(data, count, wide).records();
}
