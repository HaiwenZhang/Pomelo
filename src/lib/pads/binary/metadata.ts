import { cooperative } from "../../cooperative";
import type { PadsContainer } from "./container";
export const PADS_BASIC_TO_MM = 0.0254 / 38100;
export interface PadsName {
  text: string | null;
  raw: Uint8Array;
  offset: number;
}
export interface PadsLayer {
  id: number;
  name: PadsName;
  type: number;
  direction: number;
  thickness: number;
  copperThickness: number;
  dielectric: number;
}
export interface PadsNet {
  ordinal: number;
  name: PadsName;
  self: number;
  classOwner: number;
  anchors: [number, number];
}
export interface PadsPlacement {
  ordinal: number;
  reference: PadsName;
  at: [number, number];
  angle: number;
  bottom: boolean;
  partType: number | null;
  decal: number | null;
  alternate: number;
}
export class PadsMetadataReader {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  constructor(private readonly container: PadsContainer) {}
  async read(signal?: AbortSignal) {
    const { container } = this;
    const { view, sections, version } = container,
      pause = cooperative(signal),
      diagnostics: string[] = [],
      legacy = version === 0x2011;
    signal?.throwIfAborted();
    const bounds = (at: number, size: number) => {
      if (
        at < 0 ||
        !Number.isSafeInteger(at) ||
        size < 0 ||
        at > view.byteLength - size
      )
        throw new Error(`PADS 字段越界 ${at}+${size}`);
    };
    const u32 = (at: number) => {
      bounds(at, 4);
      return view.getUint32(at, true);
    };
    const i32 = (at: number) => {
      bounds(at, 4);
      return view.getInt32(at, true);
    };
    const f32 = (at: number) => {
      bounds(at, 4);
      const v = view.getFloat32(at, true);
      if (!Number.isFinite(v)) throw new Error(`PADS 浮点值无效 ${at}`);
      return v;
    };
    const name = (at: number, length: number): PadsName => {
      bounds(at, length);
      const field = new Uint8Array(view.buffer, view.byteOffset + at, length),
        nul = field.indexOf(0),
        raw = field.subarray(0, nul < 0 ? length : nul);
      try {
        return { text: this.decoder.decode(raw), raw, offset: at };
      } catch {
        diagnostics.push(`PADS 名称含非 UTF-8 字节，原字节已保留 @${at}`);
        return { text: null, raw, offset: at };
      }
    };
    const setup = 10 + (sections[1].count - 1) * 16 + sections[2].count * 48;
    bounds(setup, 100);
    const maxLayers = u32(setup + 16),
      scale = f32(setup + 56),
      backup = i32(setup + 76),
      width = i32(setup + 80),
      allSignals = i32(setup + 84),
      refHeight = i32(setup + 92),
      refWidth = i32(setup + 96);
    // MT6260 stores a valid 38100-BASIC (one mil) reference stroke width.
    // Do not inherit the reference importer's empirical >100000 lower bound.
    if (
      maxLayers < 1 ||
      maxLayers > 64 ||
      scale <= 0.01 ||
      scale >= 1e6 ||
      backup < 0 ||
      backup > 100000 ||
      width < 0 ||
      width >= 1e8 ||
      ![0, 1].includes(allSignals) ||
      refWidth <= 0 ||
      refWidth > refHeight ||
      refHeight >= 1e8
    )
      throw new Error("PADS 板参数布局校验失败");
    const origin: [number, number] = [
      i32(setup + 60) * PADS_BASIC_TO_MM,
      i32(setup + 64) * PADS_BASIC_TO_MM,
    ];
    const layerSection = sections[69],
      layerStride = layerSection.declaredBytes / layerSection.count,
      layers: PadsLayer[] = [];
    if (!(legacy ? layerStride === 72 : [128, 136, 152].includes(layerStride)))
      throw new Error(`PADS 层记录尺寸无效 ${layerStride}`);
    for (let id = 0; id < layerSection.count; id++) {
      const at = layerSection.offset + (legacy ? 8 : 12) + id * layerStride,
        type = id ? i32(at - 4) : 0;
      if (type < 0 || type > 6)
        throw new Error(`PADS 层类型无效 ${id}:${type}`);
      layers.push({
        id,
        name: name(at, 24),
        type,
        direction: i32(at + 32),
        thickness: i32(at + 52) * PADS_BASIC_TO_MM,
        copperThickness: i32(at + 56) * PADS_BASIC_TO_MM,
        dielectric: f32(at + 60),
      });
    }
    const ns = sections[23],
      netStride = legacy
        ? 124
        : version <= 0x2022
          ? 144
          : version === 0x2024
            ? 416
            : 424,
      nets: PadsNet[] = [];
    if (ns.count * netStride !== ns.declaredBytes)
      throw new Error("PADS 网络记录尺寸无效");
    for (let ordinal = 0; ordinal < ns.count; ordinal++) {
      if (ordinal % 512 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const old = version <= 0x2022,
        at = ns.offset + (legacy ? 12 : old ? 20 : -44) + ordinal * netStride;
      nets.push({
        ordinal,
        name: name(at + (old ? 12 : 76), 48),
        self: old ? 0 : u32(at + 144),
        classOwner: u32(at + (old ? 84 : 148)),
        anchors: old
          ? [legacy ? view.getUint16(at + 10, true) : u32(at + 8), u32(at + 92)]
          : [u32(at + 64), u32(at + 68)],
      });
    }
    const ps = sections[22],
      partStride = ps.count ? ps.declaredBytes / ps.count : 112,
      placements: PadsPlacement[] = [];
    if (!(legacy ? partStride === 84 : [96, 112].includes(partStride)))
      throw new Error(`PADS 器件记录尺寸无效 ${partStride}`);
    for (let ordinal = 0; ordinal < ps.count; ordinal++) {
      if (ordinal % 512 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const at = ps.offset - 44 + ordinal * partStride,
        next = at + partStride;
      bounds(at, partStride);
      if (legacy) {
        const pos = ps.offset + ordinal * partStride;
        placements.push({
          ordinal,
          reference: name(pos, 16),
          at: [
            i32(pos + 16) * PADS_BASIC_TO_MM,
            i32(pos + 20) * PADS_BASIC_TO_MM,
          ],
          angle: ((i32(pos + 24) / 1800000) * Math.PI) / 180,
          bottom: (view.getUint8(pos + 28) & 1) !== 0,
          partType: null,
          decal: view.getUint16(pos + 70, true),
          alternate: 0,
        });
        continue;
      }
      placements.push({
        ordinal,
        reference: name(at + 44, 16),
        at: [i32(at + 60) * PADS_BASIC_TO_MM, i32(at + 64) * PADS_BASIC_TO_MM],
        angle: ((i32(at + 68) / 1800000) * Math.PI) / 180,
        bottom: (view.getUint8(at + 72) & 1) !== 0,
        partType: partStride === 112 ? u32(next + 4) : null,
        decal: partStride === 96 ? u32(next + 24) : u32(next + 8),
        alternate: partStride === 112 ? view.getUint8(next + 17) : 0,
      });
    }
    return { maxLayers, origin, layers, nets, placements, diagnostics };
  }
}
/** Compatibility entry point; parsing state belongs to PadsMetadataReader. */
export async function readPadsMetadata(
  container: PadsContainer,
  signal?: AbortSignal,
) {
  return new PadsMetadataReader(container).read(signal);
}
