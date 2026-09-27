import type { Layer } from "../board/model";
import {
  altiumProperty,
  type AltiumPropertiesRecord,
} from "./binary/properties";
const colors = [
  "#58b5ed",
  "#83ce94",
  "#edb963",
  "#ba8bec",
  "#eb819d",
  "#54c7bd",
  "#a5b8df",
  "#e18d61",
];
const rawLayer = (id: number) => {
  if (id >= 0x01000001 && id <= 0x0100001f) return id - 0x01000000;
  if (id === 0x0100ffff) return 32;
  if (id >= 0x01010001 && id <= 0x01010010) return id - 0x01010001 + 39;
  return undefined;
};
export interface AltiumLayers {
  layers: Layer[];
  v6: Map<number, number>;
  v7: Map<number, number>;
  stackSource: "v9" | "v8" | "legacy";
}
/** Preserve physical stack order from Board6. Internal planes have different
 * V6/V7 IDs from signal layers; neither is inferred from track counts. */
export class AltiumLayerReader {
  constructor(private readonly board: AltiumPropertiesRecord) {}
  read(): AltiumLayers {
    const { board } = this;
    const fields = board.fields;
    const collect = (pattern: RegExp) => {
      const rows: {
        slot: number;
        id: number;
        name: string;
      }[] = [];
      for (const [key, value] of fields) {
        const match = pattern.exec(key);
        if (!match) continue;
        const id = Number(value),
          slot = Number(match[1]);
        if (!Number.isSafeInteger(id) || !Number.isSafeInteger(slot))
          throw new Error(`Altium 板层编号无效 ${key}`);
        const base = key.slice(0, -7),
          name = altiumProperty(board, `${base}NAME`) ?? `Layer ${slot}`;
        if (rawLayer(id) !== undefined) rows.push({ slot, id, name });
      }
      return rows.sort((a, b) => a.slot - b.slot);
    };
    const v9 = collect(/^V9_STACK_LAYER(\d+)_LAYERID$/),
      v8 = collect(/^LAYER_V8_(\d+)LAYERID$/);
    let source: AltiumLayers["stackSource"] = "legacy";
    let rows = v9;
    if (v9.length) source = "v9";
    else if (v8.length) {
      source = "v8";
      rows = v8;
    } else {
      rows = [];
      const seen = new Set<number>();
      let raw = 1,
        slot = 0;
      while (raw && raw !== 32) {
        if (seen.has(raw) || raw < 1 || raw > 54)
          throw new Error("Altium 旧版层链循环或层号无效");
        seen.add(raw);
        const name = altiumProperty(board, `LAYER${raw}NAME`) ?? `Layer ${raw}`;
        const id =
          raw === 32
            ? 0x0100ffff
            : raw >= 39
              ? 0x01010001 + raw - 39
              : 0x01000000 + raw;
        rows.push({ slot: slot++, id, name });
        const next = Number(altiumProperty(board, `LAYER${raw}NEXT`) ?? 0);
        if (!Number.isSafeInteger(next))
          throw new Error(`Altium 旧版层链值无效 ${raw}`);
        raw = next;
      }
      rows.push({
        slot,
        id: 0x0100ffff,
        name: altiumProperty(board, "LAYER32NAME") ?? "BOTTOM",
      });
    }
    if (rows.length < 2) throw new Error("Altium 铜层堆栈不足");
    const layers: Layer[] = [],
      v6 = new Map<number, number>(),
      v7 = new Map<number, number>();
    for (const row of rows) {
      if (v7.has(row.id)) continue;
      const raw = rawLayer(row.id)!;
      const id = layers.length;
      layers.push({
        id,
        name: row.name,
        color: colors[id % colors.length],
        layerFunction: raw >= 39 ? "plane" : "conductor",
      });
      v6.set(raw, id);
      v7.set(row.id, id);
    }
    if (
      !v6.has(1) ||
      !v6.has(32) ||
      layers[0].id !== v6.get(1) ||
      layers.at(-1)?.id !== v6.get(32)
    )
      throw new Error("Altium 顶层/底层堆栈顺序无效");
    return { layers, v6, v7, stackSource: source };
  }
}
/** Compatibility entry point; parsing state belongs to AltiumLayerReader. */
export function readAltiumLayers(board: AltiumPropertiesRecord): AltiumLayers {
  return new AltiumLayerReader(board).read();
}
