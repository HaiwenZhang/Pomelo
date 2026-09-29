import {
  isRecordType,
  type AllegroRecord,
  type RecordLookup,
} from "../binary/record-types";
import type { BackdrillDefinition, BackdrillSpan } from "../../board/model";
import { isUint32Words } from "../binary/record-values";
function isConcentricCircle(value: unknown): value is {
  Type: 2;
  W: number;
  H: number;
  OffsetX?: number;
  OffsetY?: number;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    "Type" in value &&
    value.Type === 2 &&
    "W" in value &&
    typeof value.W === "number" &&
    Number.isFinite(value.W) &&
    value.W > 0 &&
    "H" in value &&
    value.H === value.W &&
    (!("OffsetX" in value) || value.OffsetX === 0) &&
    (!("OffsetY" in value) || value.OffsetY === 0)
  );
}
export interface ResolvedViaStack {
  stack: AllegroRecord<0x1c>;
  backdrill?: BackdrillDefinition;
  regionCode?: number;
}
export class AllegroPadstackResolver {
  constructor(
    readonly get: RecordLookup,
    readonly layerCount: number,
    readonly version = 0,
  ) {}
  /** 0x2f single-layer pads, verified against SS8633A, PA14611 and camera in Allegro.
   * Keep the supported shape narrow: other 0x2f variants have unknown semantics.
   */
  resolvePin(
    key: number,
    placedId: number,
  ):
    | {
        stack: AllegroRecord<0x1c>;
        embeddedLayer?: number;
        regionCode?: number;
        die?: true;
      }
    | undefined {
    const get = this.get;
    const layerCount = this.layerCount;
    const version = this.version;
    const record = get(key);
    if (isRecordType(record, 0x1c)) return { stack: record };
    if (!isRecordType(record, 0x2f)) return;
    if (typeof record.T2 !== "number" || !Number.isSafeInteger(record.T2))
      return;
    const rawWords: unknown = record.UnknownArray;
    const words = isUint32Words(rawWords) ? rawWords : undefined;
    const layer = record.T2 >>> 8;
    // Native camera U2: die pads occupy BOND TOP, not physical copper index 252.
    // Other special-layer encodings remain unsupported until their semantics are known.
    if (words?.length === 6 && words[5] === 8) {
      const stack = get(words[0]);
      if (
        version < 172 ||
        record.Type !== 0 ||
        record.T2 !== 0xfc00 ||
        words[1] !== placedId ||
        words[2] !== 1 ||
        words[3] !== 0 ||
        words[4] !== 0 ||
        !isRecordType(stack, 0x1c) ||
        stack.StartLayer !== 0 ||
        stack.LayerCount !== 1 ||
        stack.PadType !== 26 ||
        stack.Plated ||
        stack.DrillSize !== 0 ||
        stack.SlotX ||
        stack.SlotY
      )
        return;
      return { stack, die: true };
    }
    // camera P1: ZONE_2 surface pins on TOP. Region is independent of physical
    // layer; the low word counts this padstack's layers, not the board's layers.
    if (words?.length === 6 && words[5] === 64) {
      const encoded = words[2],
        stack = get(words[0]);
      if (
        version < 172 ||
        record.Type !== 0 ||
        (record.T2 & 255) !== 0 ||
        layer >= layerCount ||
        words[1] !== placedId ||
        !Number.isInteger(encoded) ||
        encoded <= 0xffff ||
        encoded > 0xffffffff ||
        (encoded & 0xffff) !== 1 ||
        words[3] !== 0 ||
        words[4] !== 0 ||
        !isRecordType(stack, 0x1c) ||
        stack.StartLayer !== 0 ||
        stack.LayerCount !== 1 ||
        stack.PadType !== 10 ||
        stack.Plated ||
        stack.DrillSize !== 0 ||
        stack.SlotX ||
        stack.SlotY
      )
        return;
      return { stack, embeddedLayer: layer, regionCode: encoded >>> 16 };
    }
    // words[3] is opaque metadata: PA14611 has nonzero values on native-verified
    // single-layer pads. Do not require zero or follow it as a geometry pointer.
    if (
      !words ||
      words.length !== 6 ||
      record.Type !== 0 ||
      (record.T2 & 255) !== 0 ||
      words[1] !== placedId ||
      words[2] !== 1 ||
      words[4] !== 0 ||
      words[5] !== 16 ||
      layer >= layerCount
    )
      return;
    const stack = get(words[0]);
    if (
      !isRecordType(stack, 0x1c) ||
      stack.LayerCount !== 1 ||
      stack.DrillSize !== 0 ||
      stack.SlotY !== 0
    )
      return;
    return { stack, embeddedLayer: layer };
  }
  /** Verified 0x2f via variants, distinct from embedded pins. Backdrill counts
   * are measured from TOP (low byte) and BOTTOM (high byte); both can be present.
   * Backdrill word 3 is opaque, not a geometry pointer. Dimensions remain in source units.
   * Padstack backdrill size is NOT necessarily Show Element's machining diameter. */
  resolveVia(key: number, owner: number): ResolvedViaStack | undefined {
    const get = this.get;
    const layerCount = this.layerCount;
    const version = this.version;
    const record = get(key);
    if (isRecordType(record, 0x1c)) return { stack: record };
    if (!isRecordType(record, 0x2f) || record.Type !== 0 || record.T2 !== 0)
      return;
    const rawWords: unknown = record.UnknownArray;
    const words = isUint32Words(rawWords) ? rawWords : undefined;
    if (!words || words.length !== 6 || words[1] !== owner) return;
    // camera_test_board: native Show Element confirms these are full-span VIA12R5
    // through pins in ZONE_2, not blind vias or backdrills. The low word is the
    // layer count; retain the region code separately without inventing a layer.
    if (words[5] === 64) {
      const encoded = words[2],
        stack = get(words[0]);
      if (
        version < 172 ||
        !Number.isInteger(encoded) ||
        encoded <= 0xffff ||
        encoded > 0xffffffff ||
        (encoded & 0xffff) !== layerCount ||
        words[3] !== 0 ||
        words[4] !== 0 ||
        !isRecordType(stack, 0x1c) ||
        stack.StartLayer !== 0 ||
        stack.LayerCount !== layerCount ||
        stack.PadType !== 4 ||
        !stack.Plated ||
        stack.DrillSize <= 0 ||
        stack.SlotX ||
        stack.SlotY
      )
        return;
      return { stack, regionCode: encoded >>> 16 };
    }
    if (words[2] !== layerCount || words[5] !== 32) return;
    const encoded = words[4];
    if (!Number.isInteger(encoded) || encoded <= 0 || encoded > 0xffff) return;
    const top = encoded & 255,
      bottom = encoded >>> 8;
    if (top + bottom >= layerCount) return;
    const stack = get(words[0]);
    if (
      !isRecordType(stack, 0x1c) ||
      stack.StartLayer !== 0 ||
      stack.LayerCount !== layerCount ||
      stack.DrillSize <= 0 ||
      stack.SlotX ||
      stack.SlotY ||
      stack.NumFixedCompEntries !== 21 ||
      stack.NumCompsPerLayer !== 4
    )
      return;
    const rawMetadata: unknown = stack.DrillMetadataWords;
    const metadata = isUint32Words(rawMetadata) ? rawMetadata : undefined;
    if (
      version < 172 ||
      !metadata ||
      metadata.length !== (version >= 180 ? 29 : 21)
    )
      return;
    const rawDiameter = metadata[version >= 180 ? 7 : 0];
    if (
      !Number.isInteger(rawDiameter) ||
      rawDiameter < 0 ||
      rawDiameter > 0xffffffff
    )
      return;
    const displayDiameter = Math.abs(rawDiameter | 0);
    if (displayDiameter <= stack.DrillSize) return;
    // Slot 5 is BACKDRILL START regular pad. Slots 14/15 are solder masks and
    // must never supply a backdrill size, including when they happen to match it.
    const start = stack.Components?.[5];
    if (!isConcentricCircle(start) || start.W < stack.DrillSize) return;
    let ordinaryDiameter = 0;
    for (let i = 0; i < layerCount; i++) {
      const pad =
        stack.Components?.[
          stack.NumFixedCompEntries + stack.NumCompsPerLayer * i + 2
        ];
      if (!pad || (pad.Type !== 0 && !isConcentricCircle(pad))) return;
      if (pad.Type) ordinaryDiameter = Math.max(ordinaryDiameter, pad.W);
    }
    const spans: BackdrillSpan[] = [];
    if (top)
      spans.push({ startLayer: 0, stopLayer: top - 1, protectedLayer: top });
    if (bottom)
      spans.push({
        startLayer: layerCount - 1,
        stopLayer: layerCount - bottom,
        protectedLayer: layerCount - bottom - 1,
      });
    // Calibrated against 874 (.254), AGILEX (16 mil), and S5000 (18 mil).
    // The label envelope is independent of the enhanced circle's outer diameter.
    return {
      stack,
      backdrill: {
        spans,
        displayDiameter,
        startPadDiameter: start.W,
        labelDiameter: Math.max(
          stack.DrillSize,
          Math.min(start.W, ordinaryDiameter),
        ),
      },
    };
  }
}
