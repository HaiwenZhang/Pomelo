import { lookupString } from "../binary/string-table";
import type { BondWireInfo } from "../../board/model";
import { PointShape } from "../../board/shapes/point";
import {
  isRecordType,
  lookupRecord,
  type AllegroRecord,
  type RecordLookup,
} from "../binary/record-types";
import { AllegroBondFingerDecoder } from "./bond-finger";
import { AllegroPadstackResolver } from "./padstack";
export class AllegroBondWireResolver {
  constructor(
    readonly get: RecordLookup,
    readonly strings: ReadonlyMap<number, string>,
    readonly version: number,
    readonly layerCount: number,
  ) {}
  /** Native camera: a 2D wire from a BOND TOP die pin to a TOP bond finger.
   * Profile names come from the attribute chain, not the physical layer array.
   * Unknown endpoint/profile/segment variants stay diagnostic in the caller. */
  resolve(track: unknown):
    | {
        segment: AllegroRecord<0x16>;
        wire: BondWireInfo;
        net: number;
      }
    | undefined {
    const get = this.get;
    const strings = this.strings;
    const version = this.version;
    const layerCount = this.layerCount;
    if (
      version < 172 ||
      !isRecordType(track, 5) ||
      track.Layer !== 0xfd06 ||
      track.UnknownPtr1 !== 160
    )
      return;
    const pin = lookupRecord(get, track.Unknown4, 0x32),
      finger = lookupRecord(get, track.Unknown5a, 0x33),
      fp = lookupRecord(get, track.UnknownPtr2a, 0x2d),
      segment = lookupRecord(get, track.FirstSegPtr, 0x16);
    if (
      pin?.type !== 0x32 ||
      finger?.type !== 0x33 ||
      fp?.type !== 0x2d ||
      fp.Layer !== 0 ||
      pin.ParentFp !== fp.Key ||
      finger.UnknownPtr2 !== fp.Key ||
      segment?.type !== 0x16 ||
      segment.Parent !== track.Key ||
      segment.Next !== track.Key ||
      segment.Flags !== 160 ||
      segment.Width <= 0 ||
      ![
        segment.Width,
        segment.StartX,
        segment.StartY,
        segment.EndX,
        segment.EndY,
        fp.CoordX,
        fp.CoordY,
        fp.Rotation,
      ].every(Number.isFinite)
    )
      return;
    const pad = lookupRecord(get, pin.PadPtr, 0x0d),
      fingerStack = lookupRecord(get, finger.Padstack, 0x1c),
      assignment = lookupRecord(get, track.NetAssignment, 0x04);
    if (
      !pad ||
      !new AllegroPadstackResolver(get, layerCount, version).resolvePin(
        pad.PadStack,
        pin.Key,
      )?.die ||
      !fingerStack ||
      !new AllegroBondFingerDecoder(layerCount).placement(
        finger,
        fingerStack,
      ) ||
      fingerStack.StartLayer !== 0 ||
      assignment?.type !== 4 ||
      !assignment.Net ||
      lookupRecord(get, pin.NetPtr, 0x04)?.Net !== assignment.Net ||
      lookupRecord(get, finger.NetPtr, 0x04)?.Net !== assignment.Net
    )
      return;
    if (
      ![pad.CoordsX, pad.CoordsY, finger.CoordsX, finger.CoordsY].every(
        Number.isFinite,
      ) ||
      (segment.StartX === segment.EndX && segment.StartY === segment.EndY)
    )
      return;
    const at = new PointShape([pad.CoordsX, pad.CoordsY]).place(
      [fp.CoordX, fp.CoordY],
      (fp.Rotation * Math.PI) / 180000,
      false,
    );
    if (
      Math.hypot(at[0] - segment.StartX, at[1] - segment.StartY) > 1 ||
      segment.EndX !== finger.CoordsX ||
      segment.EndY !== finger.CoordsY
    )
      return;
    let id = track.UnknownPtr5,
      profile: string | undefined,
      material: string | undefined;
    const seen = new Set<number>();
    while (id && id !== track.Key) {
      if (seen.has(id)) return;
      seen.add(id);
      const field = get(id);
      if (!isRecordType(field, 3)) return;
      if (field.Hdr1 === 400 && field.SubType === 104) {
        if (profile !== undefined) return;
        if (typeof field.Value !== "string") return;
        profile = field.Value;
      }
      if (field.Hdr1 === 540 && field.SubType === 104) {
        if (material !== undefined) return;
        if (typeof field.Value !== "string") return;
        material = field.Value;
      }
      id = field.Next;
    }
    if (
      id !== track.Key ||
      profile !== "TOP" ||
      (material !== undefined && typeof material !== "string")
    )
      return;
    const component = lookupRecord(get, fp.InstRef, 0x07);
    return {
      segment,
      net: assignment.Net,
      wire: {
        profile,
        material,
        sourcePin: pin.Key,
        finger: finger.Key,
        reference:
          component?.RefDes ??
          lookupString(strings, component?.RefDesStrPtr) ??
          "",
        pinName: pad.Name ?? lookupString(strings, pad.NameStrId) ?? "",
      },
    };
  }
}
