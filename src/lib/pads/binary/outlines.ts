import type { PadsContainer, PadsSection } from "./container";
import { PADS_BASIC_TO_MM } from "./metadata";
import { cooperative } from "../../cooperative";
export class PadsOutlineReader {
  constructor(private readonly container: PadsContainer) {}
  async read(signal?: AbortSignal) {
    const { container } = this;
    const { view, sections: s, version } = container,
      pause = cooperative(signal);
    signal?.throwIfAborted();
    const legacy = version === 0x2011,
      os = legacy ? 96 : version <= 0x2022 ? 100 : 112,
      ps = legacy ? 12 : version <= 0x2024 ? 16 : 20;
    const byte = (
      section: PadsSection,
      rotation: number,
      stride: number,
      index: number,
      field: number,
    ) => {
      if (
        index < 0 ||
        index >= section.count ||
        field < 0 ||
        field >= stride ||
        !section.bytes
      )
        throw new Error("PADS 图形环形记录越界");
      return view.getUint8(
        section.offset + ((rotation + index * stride + field) % section.bytes),
      );
    };
    const word = (
      section: PadsSection,
      rotation: number,
      stride: number,
      index: number,
      field: number,
    ) => {
      let value = 0;
      for (let b = 0; b < 4; b++)
        value |= byte(section, rotation, stride, index, field + b) << (b * 8);
      return value;
    };
    const owner = (index: number, field: number) =>
        word(s[10], 68, os, index, field),
      piece = (index: number, field: number) =>
        word(s[11], s[11].bytes - (ps - 8), ps, index, field);
    if (
      s[10].bytes !== s[10].count * os ||
      s[11].bytes !== s[11].count * ps ||
      s[12].bytes !== s[12].count * 12
    )
      throw new Error("PADS 图形记录尺寸无效");
    const owners: {
      index: number;
      nameBytes: number[];
      kind: number;
      pieceStart: number;
      pieceCount: number;
      vertexStart: number;
      arcStart: number;
      origin: [number, number];
    }[] = [];
    const outlines: {
        owner: number;
        piece: number;
        width: number;
        vertices: {
          at: [number, number];
          attribute: number;
          arcBox: number[] | null;
        }[];
      }[] = [],
      graphics: {
        owner: number;
        piece: number;
        kind: number;
        type: number;
        layer: number;
        width: number;
        vertices: {
          at: [number, number];
          attribute: number;
          arcBox: number[] | null;
        }[];
      }[] = [];
    for (let index = 0; index < s[10].count; index++) {
      if (index % 128 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const nameOffset = legacy ? 28 : os === 100 ? 32 : 44,
        nameBytes: number[] = [];
      for (let field = nameOffset; field < os; field++) {
        const b = byte(s[10], 68, os, index, field);
        if (!b) break;
        nameBytes.push(b);
      }
      if (!nameBytes.length) continue;
      const next = (index + 1) % s[10].count,
        originOffset = os <= 100 ? 72 : 88;
      const packed = owner(next, 24);
      const run = {
        index,
        nameBytes,
        kind: legacy ? packed >>> 16 : owner(next, 28),
        pieceStart: owner(next, 8),
        pieceCount: legacy ? packed & 65535 : packed,
        vertexStart: owner(next, 12),
        arcStart: owner(next, 16),
        origin: [
          owner(index, originOffset),
          owner(index, originOffset + 4),
        ] as [number, number],
      };
      owners.push(run);
      if (run.pieceCount <= 0) continue;
      if (
        run.pieceStart < 0 ||
        run.pieceStart > s[11].count - run.pieceCount ||
        run.vertexStart < 0
      )
        throw new Error("PADS 板框分段引用无效");
      let cursor = run.vertexStart;
      for (let j = 0; j < run.pieceCount; j++) {
        const index = run.pieceStart + j,
          count = piece(index, ps - 4),
          vertices: {
            at: [number, number];
            attribute: number;
            arcBox: number[] | null;
          }[] = [];
        if (
          count < 0 ||
          ((run.kind & 65535) === 1 && count === 0) ||
          cursor > s[12].count - count
        )
          throw new Error(
            `PADS 板框顶点引用无效 owner=${run.index} kind=${run.kind} piece=${index} cursor=${cursor} count=${count}`,
          );
        for (let k = 0; k < count; k++) {
          const at = s[12].offset + (cursor + k) * 12,
            x = view.getInt32(at, true),
            y = view.getInt32(at + 4, true),
            attribute = view.getInt32(at + 8, true);
          let arcBox: number[] | null = null;
          if (attribute >= 0 && k + 1 < count) {
            const arc = run.arcStart + attribute;
            if (
              run.arcStart < 0 ||
              arc >= s[13].count ||
              s[13].bytes !== s[13].count * 20
            )
              throw new Error("PADS 板框圆弧引用无效");
            arcBox = Array.from({ length: 5 }, (_, n) =>
              view.getInt32(s[13].offset + arc * 20 + n * 4, true),
            );
          }
          vertices.push({
            at: [
              (x + run.origin[0]) * PADS_BASIC_TO_MM,
              (y + run.origin[1]) * PADS_BASIC_TO_MM,
            ],
            attribute,
            arcBox,
          });
        }
        const entry = {
          owner: run.index,
          piece: index,
          width: piece(index, ps - 8) * PADS_BASIC_TO_MM,
          vertices,
        };
        const nextPiece = (index + 1) % s[11].count,
          rotation = s[11].bytes - (ps - 8);
        graphics.push({
          ...entry,
          kind: run.kind & 65535,
          type: byte(s[11], rotation, ps, nextPiece, 0),
          layer: byte(s[11], rotation, ps, nextPiece, 1),
        });
        cursor += count;
        if ((run.kind & 65535) === 1) outlines.push(entry);
      }
    }
    return { owners, outlines, graphics };
  }
}
/** Compatibility entry point; parsing state belongs to PadsOutlineReader. */
export async function readPadsOutlines(
  container: PadsContainer,
  signal?: AbortSignal,
) {
  return new PadsOutlineReader(container).read(signal);
}
