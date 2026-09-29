import { PadsBinaryView } from "./view";
import type { PadsContainer } from "./container";
import { PADS_BASIC_TO_MM } from "./metadata";
import { cooperative } from "../../cooperative";
export interface PadsPourArc {
  sourceIndex: number;
  vertexIndex: number;
  center: [number, number];
  beginTenths: number;
  sweepTenths: number;
}
/** Preserve each boundary and all arc payloads. Polygon boundary records are
 * not proof of a hole-free filled zone or of their electrical net. */
export class PadsPourReader {
  constructor(private readonly container: PadsContainer) {}
  async read(signal?: AbortSignal) {
    const { container } = this;
    const { view, sections: s } = container,
      pause = cooperative(signal),
      legacy = container.version === 0x2011;
    signal?.throwIfAborted();
    for (const [section, stride] of [
      [52, 88],
      [53, 16],
      [54, 8],
      [55, 16],
    ])
      if (s[section].bytes !== s[section].count * stride)
        throw new Error(`PADS 铺铜记录尺寸无效 ${section}`);
    const reader = new PadsBinaryView(view, "铺铜字段"),
      u = reader.u32,
      i = reader.i32;
    const owners: {
        index: number;
        nameBytes: number[];
        type: number;
        relationshipId: number;
        objectHandle: number;
        parentRelationshipId: number;
        associationHandle: number;
        stateFlags: number;
        nameFlags: number;
        origin: [number, number];
        pieceStart: number;
        vertexStart: number;
        arcStart: number;
        pieceCount: number;
        raw: Uint8Array;
      }[] = [],
      pieces: {
        owner: number;
        index: number;
        type: number;
        layer: number;
        width: number;
        arcCount: number;
        arcs: PadsPourArc[];
        points: [number, number][];
        raw: Uint8Array;
      }[] = [];
    for (let index = 0; index < s[52].count; index++) {
      const pending = pause();
      if (pending) await pending;
      const at = s[52].offset + index * 88,
        nameBytes: number[] = [];
      for (let k = 0; k < (legacy ? 16 : 14); k++) {
        const b = view.getUint8(at + (legacy ? 68 : 70) + k);
        if (!b) break;
        nameBytes.push(b);
      }
      const owner = {
        index,
        nameBytes,
        type: view.getUint8(at + (legacy ? 85 : 87)),
        relationshipId: i(at + 12),
        objectHandle: i(at + 16),
        parentRelationshipId: i(at + 20),
        associationHandle: u(at + 48),
        stateFlags: u(at + 52),
        nameFlags: view.getUint16(at + (legacy ? 66 : 68), true),
        origin: [i(at + 24), i(at + 28)] as [number, number],
        pieceStart: u(at),
        vertexStart: u(at + 4),
        arcStart: u(at + 8),
        pieceCount: legacy ? view.getUint16(at + 64, true) : u(at + 64),
        raw: new Uint8Array(view.buffer, view.byteOffset + at, 88),
      };
      owners.push(owner);
      // Names are identifiers, not a liveness or geometry filter: real boards
      // also use HP names. Preserve every owner class and its referenced pieces;
      // assigning fill/hole/net semantics is a separate, still unverified step.
      if (owner.pieceStart > s[53].count - owner.pieceCount)
        throw new Error("PADS 铺铜分段引用越界");
      let cursor = owner.vertexStart,
        arcCursor = owner.arcStart;
      for (let j = 0; j < owner.pieceCount; j++) {
        const index = owner.pieceStart + j,
          at = s[53].offset + index * 16,
          count = u(at),
          arcCount = u(at + 4);
        if (!count || cursor > s[54].count - count)
          throw new Error("PADS 铺铜顶点引用越界");
        const points: [number, number][] = [];
        for (let k = 0; k < count; k++) {
          if (k % 512 === 0) {
            const pending = pause();
            if (pending) await pending;
          }
          const pos = s[54].offset + (cursor + k) * 8;
          points.push([
            (i(pos) + owner.origin[0]) * PADS_BASIC_TO_MM,
            (i(pos + 4) + owner.origin[1]) * PADS_BASIC_TO_MM,
          ]);
        }
        if (arcCursor > s[55].count - arcCount)
          throw new Error("PADS 铺铜圆弧引用越界");
        const arcs: PadsPourArc[] = [],
          decorated = new Set<number>();
        for (let k = 0; k < arcCount; k++) {
          if (k % 512 === 0) {
            const pending = pause();
            if (pending) await pending;
          }
          const sourceIndex = arcCursor + k,
            pos = s[55].offset + sourceIndex * 16,
            vertexIndex = u(pos + 8);
          if (vertexIndex >= count - 1 || decorated.has(vertexIndex))
            throw new Error("PADS 铺铜圆弧顶点引用无效");
          decorated.add(vertexIndex);
          arcs.push({
            sourceIndex,
            vertexIndex,
            center: [
              (i(pos) + owner.origin[0]) * PADS_BASIC_TO_MM,
              (i(pos + 4) + owner.origin[1]) * PADS_BASIC_TO_MM,
            ],
            beginTenths: view.getInt16(pos + 12, true),
            sweepTenths: view.getInt16(pos + 14, true),
          });
        }
        arcCursor += arcCount;
        cursor += count;
        pieces.push({
          owner: owner.index,
          index,
          type: view.getUint8(at + 12),
          layer: view.getUint8(at + 13),
          width: i(at + 8) * PADS_BASIC_TO_MM,
          arcCount,
          arcs,
          points,
          raw: new Uint8Array(view.buffer, view.byteOffset + at, 16),
        });
      }
    }
    const arcs = Array.from({ length: s[55].count }, (_, index) => ({
      index,
      offset: s[55].offset + index * 16,
      words: Array.from({ length: 4 }, (_, j) =>
        u(s[55].offset + index * 16 + j * 4),
      ),
    }));
    return { owners, pieces, arcs };
  }
}
/** Compatibility entry point; parsing state belongs to PadsPourReader. */
export async function readPadsPours(
  container: PadsContainer,
  signal?: AbortSignal,
) {
  return new PadsPourReader(container).read(signal);
}
