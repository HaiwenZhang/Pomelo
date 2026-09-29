import { KiCadSceneContext } from "./scene/context";
import { BoundsAccumulator } from "../board/bounds";
import type { BoardScene, Bounds } from "../board/model";

import { KiCadBoardIndexer } from "./syntax/index";
import { KiCadOutlineBuilder } from "./scene/outline";
import { KiCadPadBuilder } from "./scene/pads";
import { KiCadRouteBuilder } from "./scene/routes";
import { KiCadZoneBuilder } from "./scene/zones";
export interface KiCadInfo {
  version: number;
  incomplete: boolean;
  sourceObjects: number;
  sourcePads: number;
  sourceRoutes: number;
  sourceVias: number;
  sourceZones: number;
  sourceGraphics: number;
  sourceOutlineGraphics: number;
  sourceFilledGraphics: number;
}
/** KiCad import adapter. Unsupported visual details are explicit diagnostics. */
export async function importKiCad(
  data: ArrayBuffer,
  signal?: AbortSignal,
  progress?: (phase: string) => void,
): Promise<{
  scene: BoardScene;
  info: KiCadInfo;
}> {
  progress?.("索引 KiCad 对象");
  const index = await new KiCadBoardIndexer(new Uint8Array(data)).read(signal);
  const context = await KiCadSceneContext.read(index, signal);
  progress?.("读取 KiCad 走线与过孔");
  const routes = await new KiCadRouteBuilder(index, context).build(signal);
  progress?.("读取 KiCad 器件焊盘");
  const pads = await new KiCadPadBuilder(
    index,
    routes.layers,
    routes.nets,
    context,
  ).build(signal);
  progress?.("读取 KiCad 已保存铜区");
  const fills = await new KiCadZoneBuilder(
    index,
    routes.layers,
    routes.nets,
    context,
  ).build(signal);
  progress?.("读取 KiCad 板框与图形");
  const graphics = await new KiCadOutlineBuilder(index).build(signal);
  const extent = new BoundsAccumulator(),
    bounds = extent.bounds;
  const include = (box: Bounds) => {
    if (!Object.values(box).every(Number.isFinite)) return;
    extent.include(box);
  };
  include(routes.bounds);
  include(pads.bounds);
  include(fills.bounds);
  for (const segment of graphics.outline) extent.includeSegment(segment);
  if (!Object.values(bounds).every(Number.isFinite)) include(graphics.bounds);
  if (!Object.values(bounds).every(Number.isFinite))
    throw new Error("KiCad 文件没有可绘制几何");
  const diagnostics: string[] = [];
  if (routes.degenerateArcs + graphics.degenerateArcs)
    diagnostics.push(
      `${routes.degenerateArcs + graphics.degenerateArcs} 条源圆弧退化为直线`,
    );
  if (pads.offsetDrills)
    diagnostics.push(
      `${pads.offsetDrills} 个偏心钻孔位置尚未适配，焊盘和孔径已保留`,
    );
  const unfilled = fills.unfilledZones - fills.keepouts;
  if (unfilled > 0)
    diagnostics.push(`${unfilled} 个设计铜区没有已保存填充，未重新铺铜`);
  if (graphics.filledGraphics)
    diagnostics.push(
      `${graphics.filledGraphics} 个填充图形目前只显示边界，填充尚未适配`,
    );
  const texts = index.items.get("gr_text")?.length ?? 0;
  if (texts) diagnostics.push(`${texts} 个板级文字尚未适配`);
  if (pads.sourceFootprints) diagnostics.push("KiCad 封装图形和文字尚未适配");
  const scene: BoardScene = {
    layers: routes.layers,
    nets: routes.nets,
    segments: routes.segments,
    vias: routes.vias,
    pins: pads.pins,
    zones: fills.zones,
    outline: graphics.outline,
    drawings: graphics.drawings,
    drawingLayers: graphics.drawingLayers,
    texts: [],
    bounds,
    diagnostics,
  };
  const info: KiCadInfo = {
    version: index.version,
    incomplete: diagnostics.length > 0,
    sourceObjects: [...index.items.values()].reduce(
      (sum, spans) => sum + spans.length,
      0,
    ),
    sourcePads: pads.sourcePads,
    sourceRoutes: routes.sourceSegments + routes.sourceArcs,
    sourceVias: routes.sourceVias,
    sourceZones: fills.sourceZones,
    sourceGraphics: graphics.sourceGraphics,
    sourceOutlineGraphics: graphics.edgeGraphics,
    sourceFilledGraphics: graphics.filledGraphics,
  };
  return { scene, info };
}
