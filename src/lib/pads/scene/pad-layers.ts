import { PadsLayerMap } from "./layer-map";
import type { PadsLayer } from "../binary/metadata";
import type { PadsPadLayer, PadsPadstack } from "../binary/padstack";
import { padsPadGeometry } from "./pad-geometry";
/** Resolve local pad copper onto ordered physical copper layers. Keep relief,
 * clearance and non-copper rows separate; they are not extra filled pads.
 * Ambiguous repeated definitions remain diagnostics instead of last-row wins. */
export function resolvePadsPadLayers(
  stack: PadsPadstack,
  sourceLayers: PadsLayer[],
  version: number,
  bottom = false,
  layerMap = new PadsLayerMap(sourceLayers),
) {
  const { copper, physical } = layerMap;
  if (!copper.length) throw new Error("PADS 缺少铜层");
  const geometries: {
    layer: number;
    sourceLayer: number;
    geometry: NonNullable<ReturnType<typeof padsPadGeometry>>;
  }[] = [];
  const unresolved: {
    layer: number;
    reason: string;
    offsets: number[];
  }[] = [];
  const nonCopper: PadsPadLayer[] = [],
    reliefs: PadsPadLayer[] = [],
    clearances: PadsPadLayer[] = [];
  const byLayer = new Map<
    number,
    {
      priority: number;
      rows: PadsPadLayer[];
    }
  >();
  const put = (index: number, row: PadsPadLayer, priority: number) => {
    const prev = byLayer.get(index);
    if (!prev || prev.priority < priority)
      byLayer.set(index, { priority, rows: [row] });
    else if (prev.priority === priority) prev.rows.push(row);
  };
  for (const row of stack.layers) {
    if (row.shapeCode === 6 || row.shapeCode === 7) {
      reliefs.push(row);
      continue;
    }
    if (row.shapeCode === 8 || row.shapeCode === 9) {
      clearances.push(row);
      continue;
    }
    if (row.selector === 255) put(copper.length - 1, row, 2);
    else if (row.selector === 0) {
      for (let i = 1; i < copper.length - 1; i++) put(i, row, 1);
    } else {
      const id = row.selector + (version <= 0x2021 ? 1 : 0),
        index = physical.get(id);
      if (index === undefined) nonCopper.push(row);
      else put(index, row, 2);
    }
  }
  for (let local = 0; local < copper.length; local++) {
    const layer = bottom ? copper.length - 1 - local : local,
      rows = byLayer.get(local)?.rows ?? [];
    const signature = (r: PadsPadLayer) =>
      `${r.shapeCode}:${r.width}:${r.second}`;
    if (new Set(rows.map(signature)).size > 1) {
      unresolved.push({
        layer,
        reason: "同一铜层有冲突的焊盘定义",
        offsets: rows.map((r) => r.sourceOffset),
      });
      continue;
    }
    const override = rows[0];
    if (!override && stack.drill === 0 && local !== 0) continue;
    try {
      const geometry = padsPadGeometry(stack, layer, override);
      if (geometry)
        geometries.push({ layer, sourceLayer: copper[layer].id, geometry });
    } catch (error) {
      unresolved.push({
        layer,
        reason: String(error),
        offsets: [override?.sourceOffset ?? stack.sourceOffset],
      });
    }
  }
  return { geometries, unresolved, nonCopper, reliefs, clearances };
}
