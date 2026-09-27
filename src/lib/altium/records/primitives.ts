import type { Point } from "../../board/model";
import { AltiumBinaryReader } from "../binary/binary-records";
export const ALTIUM_MM = 0.00000254;
const mm = (raw: number) => raw * ALTIUM_MM;
const point = (data: DataView, offset: number): Point => [
  mm(data.getInt32(offset, true)),
  -mm(data.getInt32(offset + 4, true)),
];
export interface AltiumPrimitiveBase {
  index: number;
  layerV6: number;
  layerV7: number;
  net: number;
  polygon: number;
  component: number;
  keepout: boolean;
  polygonOutline: boolean;
}
export interface AltiumTrack extends AltiumPrimitiveBase {
  kind: "track";
  a: Point;
  b: Point;
  width: number;
}
export interface AltiumArc extends AltiumPrimitiveBase {
  kind: "arc";
  center: Point;
  radius: number;
  startDegrees: number;
  endDegrees: number;
  width: number;
}
export interface AltiumVia {
  kind: "via";
  index: number;
  net: number;
  at: Point;
  diameter: number;
  drill: number;
  startLayer: number;
  endLayer: number;
  mode: number;
  diameterByLayer: number[];
}
export class AltiumTrackReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly count: number,
  ) {}
  *records(): Generator<AltiumTrack> {
    const { data, count } = this;
    for (const record of new AltiumBinaryReader(
      data,
      4,
      1,
      count,
    ).singleRecords()) {
      const { view: d, offset, length } = record;
      if (length < 36)
        throw new Error(`Altium Track 长度不足 @${record.start}`);
      const layerV7 = length >= 45 ? d.getUint32(offset + 41, true) : 0;
      yield {
        kind: "track",
        index: record.index,
        layerV6: d.getUint8(offset + 0),
        layerV7,
        net: d.getUint16(offset + 3, true),
        polygon: d.getUint16(offset + 5, true),
        component: d.getUint16(offset + 7, true),
        polygonOutline: !!(d.getUint8(offset + 1) & 2),
        keepout: d.getUint8(offset + 2) === 2,
        a: point(d, offset + 13),
        b: point(d, offset + 21),
        width: mm(d.getInt32(offset + 29, true)),
      };
    }
  }
}
/** Compatibility entry point; parsing state belongs to AltiumTrackReader. */
export function* altiumTracks(
  data: Uint8Array,
  count: number,
): Generator<AltiumTrack> {
  yield* new AltiumTrackReader(data, count).records();
}
export class AltiumArcReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly count: number,
  ) {}
  *records(): Generator<AltiumArc> {
    const { data, count } = this;
    for (const record of new AltiumBinaryReader(
      data,
      1,
      1,
      count,
    ).singleRecords()) {
      const { view: d, offset, length } = record;
      if (length < 47) throw new Error(`Altium Arc 长度不足 @${record.start}`);
      const layerV7 = length >= 56 ? d.getUint32(offset + 52, true) : 0;
      yield {
        kind: "arc",
        index: record.index,
        layerV6: d.getUint8(offset + 0),
        layerV7,
        net: d.getUint16(offset + 3, true),
        polygon: d.getUint16(offset + 5, true),
        component: d.getUint16(offset + 7, true),
        polygonOutline: !!(d.getUint8(offset + 1) & 2),
        keepout: d.getUint8(offset + 2) === 2,
        center: point(d, offset + 13),
        radius: mm(d.getInt32(offset + 21, true)),
        startDegrees: d.getFloat64(offset + 25, true),
        endDegrees: d.getFloat64(offset + 33, true),
        width: mm(d.getInt32(offset + 41, true)),
      };
    }
  }
}
/** Compatibility entry point; parsing state belongs to AltiumArcReader. */
export function* altiumArcs(
  data: Uint8Array,
  count: number,
): Generator<AltiumArc> {
  yield* new AltiumArcReader(data, count).records();
}
export class AltiumViaReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly count: number,
  ) {}
  *records(): Generator<AltiumVia> {
    const { data, count } = this;
    for (const record of new AltiumBinaryReader(
      data,
      3,
      1,
      count,
    ).singleRecords()) {
      const { view: d, offset, length } = record;
      if (length < 31) throw new Error(`Altium Via 长度不足 @${record.start}`);
      const mode = length > 74 ? d.getUint8(offset + 74) : 0;
      const diameterByLayer: number[] = [];
      if (length >= 203)
        for (let i = 0; i < 32; i++)
          diameterByLayer.push(mm(d.getInt32(offset + 75 + i * 4, true)));
      yield {
        kind: "via",
        index: record.index,
        net: d.getUint16(offset + 3, true),
        at: point(d, offset + 13),
        diameter: mm(d.getInt32(offset + 21, true)),
        drill: mm(d.getInt32(offset + 25, true)),
        startLayer: d.getUint8(offset + 29),
        endLayer: d.getUint8(offset + 30),
        mode,
        diameterByLayer,
      };
    }
  }
}
/** Compatibility entry point; parsing state belongs to AltiumViaReader. */
export function* altiumVias(
  data: Uint8Array,
  count: number,
): Generator<AltiumVia> {
  yield* new AltiumViaReader(data, count).records();
}
