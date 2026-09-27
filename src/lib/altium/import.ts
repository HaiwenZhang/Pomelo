import type { BoardScene } from "../board/model";
import type { Bounds } from "../board/model";
import { AltiumCompoundFile } from "./binary/compound";
import { AltiumPropertyReader } from "./binary/properties";
import { AltiumLayerReader } from "./layers";
import { AltiumNetReader } from "./nets";
import { AltiumOutlineReader } from "./outline";
import { AltiumRouteBuilder } from "./scene/route-scene";
import { AltiumPadBuilder } from "./scene/pad-scene";
import { AltiumRegionBuilder } from "./scene/region-scene";
import { AltiumTextBuilder } from "./scene/text-scene";
import { AltiumFillBuilder } from "./scene/fill-scene";
export interface AltiumInfo {
  incomplete: boolean;
  sourceObjects: number;
  sourcePads: number;
  sourceTracks: number;
  sourceArcs: number;
  sourceVias: number;
  sourcePolygons: number;
  sourceRegions: number;
  filledRegions: number;
  sourceFills: number;
  filledFills: number;
  sourceTexts: number;
  nonCopperPads: number;
}
/** Browser-local PcbDoc import. Unsupported object families remain diagnostic. */
export async function importAltium(
  data: ArrayBuffer,
  signal?: AbortSignal,
  progress?: (phase: string) => void,
): Promise<{
  scene: BoardScene;
  info: AltiumInfo;
}> {
  progress?.("读取 Altium 复合文件");
  const compound = new AltiumCompoundFile(data),
    paths = new Set(compound.streams.map((s) => s.path.toLowerCase()));
  const count = (family: string) => {
    if (!paths.has(`${family.toLowerCase()}/header`)) return 0;
    const header = compound.read(`${family}/Header`);
    if (header.length < 4) throw new Error(`Altium ${family} Header 长度无效`);
    return new DataView(
      header.buffer,
      header.byteOffset,
      header.byteLength,
    ).getUint32(0, true);
  };
  const requireData = (family: string) => compound.read(`${family}/Data`);
  if (count("Board6") !== 1) throw new Error("Altium Board6 数量无效");
  const board = (
    await new AltiumPropertyReader(requireData("Board6"), 1).read(signal)
  )[0];
  const stack = new AltiumLayerReader(board).read(),
    outline = new AltiumOutlineReader(board).read();
  progress?.("读取 Altium 网络与器件");
  const nets = await new AltiumNetReader(
    requireData("Nets6"),
    count("Nets6"),
  ).read(signal);
  const components = await new AltiumPropertyReader(
    requireData("Components6"),
    count("Components6"),
  ).read(signal);
  progress?.("读取 Altium 已保存铜区");
  const sourcePolygons = count("Polygons6"),
    sourceRegions = count("Regions6"),
    sourceTexts = count("Texts6");
  const polygons = await new AltiumPropertyReader(
    requireData("Polygons6"),
    sourcePolygons,
  ).read(signal);
  const regions = await new AltiumRegionBuilder({
    data: requireData("Regions6"),
    count: sourceRegions,
    stack,
    nets,
    polygons,
    board,
  }).build(signal);
  progress?.("读取 Altium 走线和过孔");
  const trackCount = count("Tracks6"),
    arcCount = count("Arcs6"),
    viaCount = count("Vias6"),
    padCount = count("Pads6");
  const routes = await new AltiumRouteBuilder({
    streams: {
      tracks: requireData("Tracks6"),
      arcs: requireData("Arcs6"),
      vias: requireData("Vias6"),
    },
    counts: { tracks: trackCount, arcs: arcCount, vias: viaCount },
    stack,
    board,
    nets,
    filledPolygonIds: regions.filledPolygonIds,
    polygons,
  }).build(signal);
  progress?.("读取 Altium 焊盘");
  const pads = await new AltiumPadBuilder({
    data: requireData("Pads6"),
    count: padCount,
    stack,
    nets,
    components,
    board,
  }).build(signal);
  const sourceFills = count("Fills6");
  const fills = await new AltiumFillBuilder({
    data: requireData("Fills6"),
    count: sourceFills,
    stack,
    nets,
    board,
  }).build(signal);
  progress?.("读取 Altium 文字");
  const textModel = await new AltiumTextBuilder({
    data: requireData("Texts6"),
    count: sourceTexts,
    wideData: requireData("WideStrings6"),
    stack,
    board,
  }).build(signal);
  signal?.throwIfAborted();
  const bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  for (const box of [
    outline.bounds,
    routes.bounds,
    pads.bounds,
    regions.bounds,
    fills.bounds,
  ]) {
    if (!Object.values(box).every(Number.isFinite)) continue;
    bounds.minX = Math.min(bounds.minX, box.minX);
    bounds.minY = Math.min(bounds.minY, box.minY);
    bounds.maxX = Math.max(bounds.maxX, box.maxX);
    bounds.maxY = Math.max(bounds.maxY, box.maxY);
  }
  if (!Object.values(bounds).every(Number.isFinite))
    throw new Error("Altium 文件没有可绘制几何");
  const diagnostics: string[] = [];
  if (sourcePolygons > regions.filledPolygons)
    diagnostics.push(
      `${sourcePolygons - regions.filledPolygons} 个 Polygon6 设计轮廓没有匹配的已保存填充，未重新铺铜`,
    );
  if (regions.nonCopperRegions)
    diagnostics.push(
      `${regions.nonCopperRegions} 个非铜层 Region6 图形只显示轮廓`,
    );
  if (regions.otherRegions)
    diagnostics.push(
      `${regions.otherRegions} 个裁切或其他 Region6 图形尚未显示`,
    );
  if (textModel.emptyTexts)
    diagnostics.push(`${textModel.emptyTexts} 个空文字或零尺寸文字没有笔画`);
  if (textModel.nonStrokeFonts)
    diagnostics.push(
      `${textModel.nonStrokeFonts} 个非笔画字体文字暂以通用笔画字体显示`,
    );
  if (pads.nonCopperPads > pads.drawings.length)
    diagnostics.push(
      `${pads.nonCopperPads - pads.drawings.length} 个非铜层焊盘缺少有效轮廓`,
    );
  if (pads.unsupportedShapes)
    diagnostics.push(`${pads.unsupportedShapes} 个焊盘使用未支持形状`);
  if (pads.unsupportedHoles)
    diagnostics.push(`${pads.unsupportedHoles} 个焊盘孔形按圆孔显示`);
  if (pads.rotatedSlots)
    diagnostics.push(
      `${pads.rotatedSlots} 个长孔具有非直角局部旋转，显示方向待支持`,
    );
  if (pads.offsetHoles)
    diagnostics.push(
      `${pads.offsetHoles} 个焊盘具有偏心孔；铜形偏移已保留，孔位仍以焊盘中心显示`,
    );
  if (routes.unfilledPolygonPrimitives)
    diagnostics.push(
      `${routes.unfilledPolygonPrimitives} 个铜区填充走线/圆弧以源笔画显示，尚未并合为填充区域`,
    );
  if (routes.keepoutPrimitives)
    diagnostics.push(`${routes.keepoutPrimitives} 个禁布图元尚未显示`);
  if (routes.zeroWidthPrimitives)
    diagnostics.push(`${routes.zeroWidthPrimitives} 个零宽或退化图元尚未显示`);
  if (fills.keepouts)
    diagnostics.push(`${fills.keepouts} 个 Fill6 禁布图元尚未显示`);
  if (fills.degenerate)
    diagnostics.push(`${fills.degenerate} 个 Fill6 矩形尺寸退化`);
  const drawingLayers = new Map(
    [
      ...routes.drawingLayers,
      ...fills.drawingLayers,
      ...regions.drawingLayers,
      ...textModel.drawingLayers,
      ...pads.drawingLayers,
    ].map((layer) => [layer.id, layer]),
  );
  const scene: BoardScene = {
    layers: stack.layers,
    nets,
    segments: routes.segments,
    vias: routes.vias,
    pins: [...routes.singleLayerPads, ...pads.pins],
    zones: [...regions.zones, ...fills.zones],
    outline: outline.outline,
    texts: textModel.texts,
    drawings: [
      ...routes.drawings,
      ...regions.drawings,
      ...pads.drawings,
      ...fills.drawings,
    ],
    drawingLayers: [...drawingLayers.values()],
    bounds,
    diagnostics,
  };
  const info: AltiumInfo = {
    incomplete: diagnostics.length > 0,
    sourceObjects:
      trackCount +
      arcCount +
      viaCount +
      padCount +
      sourcePolygons +
      sourceRegions +
      sourceFills +
      sourceTexts,
    sourcePads: padCount,
    sourceTracks: trackCount,
    sourceArcs: arcCount,
    sourceVias: viaCount,
    sourcePolygons,
    sourceRegions,
    filledRegions: regions.filledRegions,
    sourceFills,
    filledFills: fills.zones.length,
    sourceTexts,
    nonCopperPads: pads.nonCopperPads,
  };
  return { scene, info };
}
