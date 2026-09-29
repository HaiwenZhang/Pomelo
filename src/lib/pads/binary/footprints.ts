import { PadsBinaryView } from "./view";
import type { PadsContainer } from "./container";
import {
  PADS_BASIC_TO_MM,
  type PadsName,
  type PadsPlacement,
} from "./metadata";
import type { PadsPadstack } from "./padstack";
import { cooperative } from "../../cooperative";
export interface PadsTerminal {
  ordinal: number;
  name: PadsName;
  at: [number, number];
  padstack: number;
  sourceOffset: number;
}
export interface PadsFootprint {
  index: number;
  active: boolean;
  name: PadsName;
  terminals: PadsTerminal[];
  sourceOffset: number;
}
export class PadsFootprintReader {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  constructor(
    private readonly container: PadsContainer,
    private readonly pads: PadsPadstack[],
    private readonly placements: PadsPlacement[],
  ) {}
  async read(signal?: AbortSignal) {
    const { container, pads, placements } = this;
    const { view, sections, version } = container,
      pause = cooperative(signal),
      diagnostics: string[] = [],
      legacy = version === 0x2011;
    signal?.throwIfAborted();
    const reader = new PadsBinaryView(view, "封装字段"),
      range = reader.range,
      i32 = reader.i32;
    const name = (at: number, n: number): PadsName => {
      range(at, n);
      const bytes = new Uint8Array(view.buffer, view.byteOffset + at, n),
        end = bytes.indexOf(0),
        raw = bytes.subarray(0, end < 0 ? n : end);
      try {
        return { text: this.decoder.decode(raw), raw, offset: at };
      } catch {
        diagnostics.push(`PADS 封装名称含非 UTF-8 字节 @${at}`);
        return { text: null, raw, offset: at };
      }
    };
    const ds = sections[14],
      stride = ds.count ? ds.declaredBytes / ds.count : 112;
    if (!(legacy ? stride === 92 : [100, 112].includes(stride)))
      throw new Error(`PADS 封装记录尺寸无效 ${stride}`);
    // The first built-in decal can be JMPVIA_AAAAB (D CALSS_MAIN), so its
    // spelling/order is not a framing marker. Validate record and reference bounds.
    const ts = sections[15],
      terminalStride = version <= 0x2020 ? 20 : 36,
      terminalBase = ts.offset + (legacy ? 0 : version <= 0x2020 ? 16 : 0),
      pairBase = ts.offset + ts.declaredBytes,
      pairStride = legacy ? 4 : 8;
    if (ts.count * terminalStride !== ts.declaredBytes)
      throw new Error("PADS 引脚表尺寸无效");
    range(terminalBase, ts.declaredBytes);
    const footprints: PadsFootprint[] = [];
    for (let index = 0; index < ds.count; index++) {
      if (index % 128 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const at = ds.offset + index * stride;
      range(at, stride);
      const active = view.getUint16(at + (legacy ? 60 : 64), true) === 65534,
        fp: PadsFootprint = {
          index,
          active,
          name: name(at, version <= 0x2022 ? 40 : 41),
          terminals: [],
          sourceOffset: at,
        };
      footprints.push(fp);
      if (!active) continue;
      const rawStart = legacy ? view.getUint16(at + 64, true) : i32(at + 68),
        start =
          !legacy && version <= 0x2020 && rawStart > 0
            ? rawStart - 1
            : rawStart,
        count = legacy ? view.getUint16(at + 66, true) : i32(at + 72);
      if (
        count < 0 ||
        count > ts.count ||
        (count && (start < 0 || start > ts.count - count))
      )
        throw new Error(`PADS 封装引脚引用越界 ${index}:${start}+${count}`);
      const mappings = new Map<number, number>([[0, 0]]),
        pairStart = legacy ? view.getUint16(at + 42, true) : i32(at + 44),
        pairCount = i32(at + (legacy ? 80 : 88));
      if (pairCount < 0 || (pairStart < 0 && pairCount))
        throw new Error(`PADS 引脚焊盘映射无效 ${index}`);
      range(
        pairBase + Math.max(0, pairStart) * pairStride,
        pairCount * pairStride,
      );
      for (let j = 0; j < pairCount; j++) {
        const pair = pairBase + (pairStart + j) * pairStride,
          ordinal = legacy ? view.getUint16(pair, true) : i32(pair),
          pad = legacy ? view.getUint16(pair + 2, true) : i32(pair + 4);
        if (ordinal < 0 || ordinal > count || pad < 0 || !pads[pad]?.active)
          throw new Error(`PADS 引脚焊盘引用无效 ${index}:${ordinal}->${pad}`);
        mappings.set(ordinal, pad);
      }
      for (let j = 0; j < count; j++) {
        const sourceOffset = terminalBase + (start + j) * terminalStride,
          old = version <= 0x2020;
        const terminalName = old
          ? { text: "", raw: new Uint8Array(), offset: sourceOffset }
          : name(sourceOffset + 20, 4);
        const padstack = mappings.get(j + 1) ?? mappings.get(0)!;
        if (!pads[padstack]?.active)
          throw new Error(`PADS 缺少默认焊盘 ${index}`);
        fp.terminals.push({
          ordinal: j + 1,
          name: terminalName,
          at: [
            i32(sourceOffset + (legacy ? 0 : old ? 4 : 0)) * PADS_BASIC_TO_MM,
            i32(sourceOffset + (legacy ? 4 : old ? 8 : 4)) * PADS_BASIC_TO_MM,
          ],
          padstack,
          sourceOffset,
        });
      }
    }
    const partTypes: {
        index: number;
        name: PadsName;
        decals: number[];
      }[] = [],
      pt = sections[17];
    if (version !== 0x2021 && pt.count) {
      const stride = pt.declaredBytes / pt.count;
      if (!(legacy ? stride === 128 : [208, 224].includes(stride)))
        throw new Error("PADS 器件类型记录尺寸无效");
      for (let index = 0; index < pt.count; index++) {
        const at = pt.offset + (legacy ? 0 : -44) + index * stride;
        range(at, stride);
        const decals: number[] = [],
          start = stride === 208 ? 112 : 96;
        if (legacy) {
          for (let off = 48; off < 116; off += 4) {
            const decal = view.getInt16(at + off, true);
            if (decal < 0 || view.getInt16(at + off + 2, true) !== decal) break;
            decals.push(decal);
          }
          partTypes.push({ index, name: name(at, 40), decals });
          continue;
        }
        if (stride === 208) {
          const decal = i32(at + start);
          if (decal >= 0) decals.push(decal);
        } else
          for (let off = start; off + 8 <= stride; off += 8) {
            const decal = i32(at + off);
            if (decal < 0 || i32(at + off + 4) !== decal) break;
            decals.push(decal);
          }
        partTypes.push({ index, name: name(at + 44, 36), decals });
      }
    }
    const instances: {
        placement: number;
        footprint: number;
      }[] = [],
      unresolved: {
        placement: number;
        reason: string;
      }[] = [];
    for (const placement of placements) {
      if (placement.reference.raw.length === 0) continue;
      const choices =
        placement.partType === null
          ? []
          : (partTypes[placement.partType]?.decals ?? []);
      const decal =
        placement.decal ?? choices[placement.alternate] ?? choices[0];
      if (decal === undefined || !footprints[decal]?.active)
        unresolved.push({
          placement: placement.ordinal,
          reason: `缺少封装引用 ${decal}`,
        });
      else instances.push({ placement: placement.ordinal, footprint: decal });
    }
    return { footprints, partTypes, instances, unresolved, diagnostics };
  }
}
/** Compatibility entry point; parsing state belongs to PadsFootprintReader. */
export async function readPadsFootprints(
  container: PadsContainer,
  pads: PadsPadstack[],
  placements: PadsPlacement[],
  signal?: AbortSignal,
) {
  return new PadsFootprintReader(container, pads, placements).read(signal);
}
