import type { PadsContainer } from "./container";
import { cooperative } from "../../cooperative";
import { PADS_BASIC_TO_MM } from "./metadata";
export interface PadsPadLayer {
  selector: number;
  rawSelector: number;
  shapeCode: number;
  width: number;
  second: number;
  sourceOffset: number;
  metadataOffset: number;
  shapeOffset: number;
}
export interface PadsPadstack {
  index: number;
  active: boolean;
  sourceOffset: number;
  shapeCode: number;
  width: number;
  drill: number;
  fingerLength: number;
  fingerOffset: number;
  angle: number;
  drillStart: number;
  drillEnd: number;
  slotLength: number;
  slotAngle: number;
  holeFlags?: number;
  plated?: boolean;
  layers: PadsPadLayer[];
}
/** Decode source definitions without guessing unknown shape codes or plating.
 * Dimensions are mm, angles radians; raw selector/code values remain available. */
export class PadsPadstackReader {
  constructor(private readonly container: PadsContainer) {}
  async read(signal?: AbortSignal) {
    const { container } = this;
    const { view, sections, version } = container,
      stacks = sections[4],
      layerSection = sections[5],
      pause = cooperative(signal);
    signal?.throwIfAborted();
    const range = (at: number, n: number) => {
      if (
        !Number.isSafeInteger(at) ||
        at < 0 ||
        n < 0 ||
        at > view.byteLength - n
      )
        throw new Error(`PADS 焊盘字段越界 ${at}+${n}`);
    };
    const u8 = (at: number) => {
      range(at, 1);
      return view.getUint8(at);
    };
    const u32 = (at: number) => {
      range(at, 4);
      return view.getUint32(at, true);
    };
    const i32 = (at: number) => {
      range(at, 4);
      return view.getInt32(at, true);
    };
    const length = (at: number) => i32(at) * PADS_BASIC_TO_MM,
      angle = (at: number) => ((i32(at) / 1800000) * Math.PI) / 180;
    const legacy2011 = version === 0x2011;
    const through2021 = version <= 0x2021;
    const version2022 = version === 0x2022;
    const stride = legacy2011 ? 40 : through2021 ? 52 : version2022 ? 56 : 64;
    const rotation = legacy2011 ? 0 : through2021 ? 24 : version2022 ? 20 : 28;
    const offsets = legacy2011
      ? {
          width: 0,
          drill: 4,
          finger: 8,
          fingerOffset: 12,
          angle: 16,
          start: 20,
          marker: 22,
          shape: 23,
          count: 24,
        }
      : through2021
        ? {
            width: 24,
            drill: 28,
            finger: 32,
            fingerOffset: 36,
            angle: 40,
            start: 44,
            marker: 48,
            shape: 49,
            count: 50,
          }
        : version2022
          ? {
              width: 20,
              drill: 24,
              finger: 28,
              fingerOffset: 32,
              angle: 40,
              start: 44,
              marker: 48,
              shape: 49,
              count: 50,
            }
          : {
              width: 28,
              drill: 32,
              finger: 36,
              fingerOffset: 44,
              angle: 48,
              start: 52,
              marker: 56,
              shape: 57,
              count: 58,
            };
    if (stacks.count * stride !== stacks.declaredBytes)
      throw new Error("PADS Padstack 记录尺寸不符");
    const base = stacks.offset - rotation;
    range(base, stacks.count * stride);
    const layerStride = through2021 ? 20 : 24;
    const layerBase =
      base +
      stacks.count * stride +
      (legacy2011 ? -4 : through2021 ? 20 : version2022 ? 64 : 24);
    if (layerSection.count * layerStride !== layerSection.declaredBytes)
      throw new Error("PADS 逐层焊盘记录尺寸不符");
    range(layerBase, layerSection.declaredBytes);
    const result: PadsPadstack[] = [];
    for (let index = 0; index < stacks.count; index++) {
      if (index % 512 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const at = base + index * stride,
        active = u8(at + offsets.marker) === 254;
      const pad: PadsPadstack = {
        index,
        active,
        sourceOffset: at,
        shapeCode: u8(at + offsets.shape),
        width: length(at + offsets.width),
        drill: length(at + offsets.drill),
        fingerLength: length(at + offsets.finger),
        fingerOffset: length(at + offsets.fingerOffset),
        angle: angle(at + offsets.angle),
        drillStart: through2021 ? 0 : u8(at + (version2022 ? 51 : 59)),
        drillEnd: through2021 ? 0 : u8(at + (version2022 ? 52 : 60)),
        slotLength: 0,
        slotAngle: 0,
        layers: [],
      };
      result.push(pad);
      if (!active) continue;
      if (
        (version >= 0x2024 ||
          legacy2011 ||
          version === 0x2020 ||
          version === 0x2021) &&
        pad.drill > 0
      ) {
        const holeAt =
          at + (legacy2011 ? 28 : version <= 0x2021 ? stride + 4 : stride);
        pad.holeFlags = u32(holeAt);
        if ((pad.holeFlags & ~11) === 0) pad.plated = (pad.holeFlags & 2) === 0;
        if (pad.holeFlags & 8) {
          if (legacy2011) throw new Error("PADS 0x2011 槽孔载体尚待核验");
          pad.slotLength = length(holeAt + 8);
          pad.slotAngle = angle(holeAt + 12);
        }
      }
      const start = legacy2011
          ? view.getUint16(at + offsets.start, true)
          : u32(at + offsets.start),
        count = u8(at + offsets.count),
        total = layerSection.count;
      if (
        count &&
        (count > total ||
          (version2022
            ? start > total
            : start >= total || count > total - start))
      )
        throw new Error(`PADS 逐层焊盘引用越界 ${index}`);
      for (let j = 0; j < count; j++) {
        const geometryIndex = version2022
          ? (start + total - (2 % total) + j) % total
          : start + j;
        const successor = version2022
          ? (geometryIndex + 1) % total
          : geometryIndex + 1;
        const implicit = [0x2011, 0x2020, 0x2021, 0x2024, 0x2026].includes(
          version,
        );
        const metadataIndex =
          version2022 || implicit || [0x2020, 0x2024, 0x2027].includes(version)
            ? successor
            : geometryIndex;
        const shapeIndex = metadataIndex;
        const geometryAt = layerBase + geometryIndex * layerStride,
          metadataAt = layerBase + metadataIndex * layerStride;
        const shapeAt = layerBase + shapeIndex * layerStride + 1;
        // These dialects begin with fixed inner/back rows. Only subsequent rows
        // use the serialized layer selector. Their metadata is successor-carried.
        // Preserve the raw byte as evidence rather than overwriting it silently.
        range(metadataAt, layerStride);
        const rawSelector = u8(metadataAt),
          selector = implicit && j < 2 ? (j === 0 ? 0 : 255) : rawSelector;
        pad.layers.push({
          selector,
          rawSelector,
          shapeCode: u8(shapeAt),
          width: length(geometryAt + 4),
          second: length(geometryAt + 8),
          sourceOffset: geometryAt,
          metadataOffset: metadataAt,
          shapeOffset: shapeAt,
        });
      }
    }
    return result;
  }
}
/** Compatibility entry point; parsing state belongs to PadsPadstackReader. */
export async function readPadsPadstacks(
  container: PadsContainer,
  signal?: AbortSignal,
) {
  return new PadsPadstackReader(container).read(signal);
}
