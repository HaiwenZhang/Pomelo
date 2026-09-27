import type { Segment } from "../../board/model";
import { cooperative } from "../../cooperative";
import { padsPourGeometry, type PadsPourGeometryPiece } from "./pour-geometry";
import type { readPadsPourLinks } from "./pour-links";
type Source = {
  owners: {
    pieceStart: number;
    pieceCount: number;
  }[];
  pieces: (PadsPourGeometryPiece & {
    layer: number;
  })[];
};
export interface PadsCopperContour {
  piece: number;
  width: number;
  path: Segment[];
}
export interface PadsCopperFill {
  owner: number;
  boundary: number;
  layer: number;
  net: number | null;
  outer: PadsCopperContour;
  holes: PadsCopperContour[];
  thermals: Segment[];
  zeroWidthThermalMarkers: number[];
  unresolvedThermalPieces: number[];
}
/** Assemble saved fill geometry without repouring design boundaries. Contour
 * widths remain explicit until their native display/offset semantics are checked. */
export class PadsCopperBuilder {
  constructor(
    private readonly source: Source,
    private readonly groups: Awaited<ReturnType<typeof readPadsPourLinks>>,
    private readonly ownerNets: Map<number, number | null>,
  ) {}
  async build(signal?: AbortSignal) {
    const { source, groups, ownerNets } = this;
    const pause = cooperative(signal),
      fills: PadsCopperFill[] = [],
      boundaryOnly: number[] = [],
      diagnostics: {
        owner: number;
        error: string;
      }[] = [];
    signal?.throwIfAborted();
    const pieces = new Map(source.pieces.map((p) => [p.index, p]));
    const owned = (index: number) => {
      const o = source.owners[index];
      if (!o) throw new Error("PADS 铜区 owner 不存在");
      return Array.from({ length: o.pieceCount }, (_, j) => {
        const p = pieces.get(o.pieceStart + j);
        if (!p || p.owner !== index) throw new Error("PADS 铜区分段归属不符");
        return p;
      });
    };
    for (const group of groups) {
      const pending = pause();
      if (pending) await pending;
      if (!group.fills.length) boundaryOnly.push(group.boundary);
      for (const fill of group.fills) {
        try {
          const outerPieces = owned(fill.owner);
          if (outerPieces.length !== 1)
            throw new Error("PADS 多外轮廓填充尚待核验");
          if (!ownerNets.has(fill.owner))
            throw new Error("PADS 铜区缺少网络映射");
          const outer = outerPieces[0],
            net = ownerNets.get(fill.owner)!,
            layer = outer.layer;
          const contour = (p: Source["pieces"][number]): PadsCopperContour => {
            if (p.layer !== layer) throw new Error("PADS 铜区孔洞层不匹配");
            const g = padsPourGeometry(p, layer, net ?? -1);
            if (g.kind !== "contour")
              throw new Error("PADS 铜区轮廓为开放线段");
            return { piece: p.index, width: p.width, path: g.path };
          };
          const result: PadsCopperFill = {
            owner: fill.owner,
            boundary: group.boundary,
            layer,
            net,
            outer: contour(outer),
            holes: [],
            thermals: [],
            zeroWidthThermalMarkers: [],
            unresolvedThermalPieces: [],
          };
          for (const hole of fill.holes)
            for (const p of owned(hole)) result.holes.push(contour(p));
          for (const thermal of fill.thermals) {
            const pending = pause();
            if (pending) await pending;
            for (const p of owned(thermal)) {
              if (p.layer !== layer) throw new Error("PADS 热连接层不匹配");
              const g = padsPourGeometry(p, layer, net ?? -1);
              if (g.kind !== "strokes")
                throw new Error("PADS 热连接非线段分段尚待核验");
              if (g.path.length !== p.points.length / 2) {
                const marker =
                  p.width === 0 &&
                  p.points.length === 2 &&
                  p.points[0][0] === p.points[1][0] &&
                  p.points[0][1] === p.points[1][1];
                (marker
                  ? result.zeroWidthThermalMarkers
                  : result.unresolvedThermalPieces
                ).push(p.index);
              }
              result.thermals.push(...g.path);
            }
          }
          fills.push(result);
        } catch (error) {
          signal?.throwIfAborted();
          diagnostics.push({ owner: fill.owner, error: String(error) });
        }
      }
    }
    return { fills, boundaryOnly, diagnostics };
  }
}
/** Compatibility entry point; parsing state belongs to PadsCopperBuilder. */
export async function assemblePadsCopper(
  source: Source,
  groups: Awaited<ReturnType<typeof readPadsPourLinks>>,
  ownerNets: Map<number, number | null>,
  signal?: AbortSignal,
) {
  return new PadsCopperBuilder(source, groups, ownerNets).build(signal);
}
