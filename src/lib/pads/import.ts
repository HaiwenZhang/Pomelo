import { PadsLayerMap } from "./scene/layer-map";
import { copperZoneFromMesh } from "../board/copper-zone";
import { BoundsAccumulator } from "../board/bounds";
import type { BoardScene } from "../board/model";

import { cooperative } from "../cooperative";
import { PadsConnectivityReader } from "./binary/connectivity";
import { PadsContainerReader } from "./binary/container";
import { PadsCopperBuilder } from "./copper/copper";
import { PadsCopperBatch } from "./copper/copper-batch";
import { PadsFootprintReader } from "./binary/footprints";
import { PadsJunctionReader } from "./binary/junctions";
import { PadsMetadataReader } from "./binary/metadata";
import { PadsOutlineBuilder } from "./scene/outline-scene";
import { PadsOutlineReader } from "./binary/outlines";
import { PadsPadstackReader } from "./binary/padstack";
import { PadsPinJunctionReader } from "./binary/pin-junctions";
import { PadsPinBuilder } from "./scene/pins";
import { PadsPourLinkReader } from "./copper/pour-links";
import { PadsPourNetResolver } from "./copper/pour-nets";
import { PadsPourReader } from "./binary/pours";
import { PadsRouteBuilder } from "./scene/route-scene";
import { PadsRouteReader } from "./binary/routes";
import { PadsViaBuilder } from "./scene/vias";
export interface PadsInfo {
  version: number;
  incomplete: boolean;
  sourcePins: number;
  sourceVias: number;
  viaAliases: {
    source: number;
    target: number;
  }[];
  sourceRoutes: number;
  auxiliaryRoutes: number;
  sourceCopperFills: number;
  sourceCopperZones: number;
  sourceOutlines: number;
  sourceOutlineSegments: number;
  unresolvedNetworks: {
    placement: number;
    terminal: number;
  }[];
  fallbackPinNames: number;
}
/** Incremental PADS import. Missing object families are reported in diagnostics. */
export async function importPads(
  data: ArrayBuffer,
  signal?: AbortSignal,
  progress?: (phase: string) => void,
): Promise<{
  scene: BoardScene;
  info: PadsInfo;
}> {
  signal?.throwIfAborted();
  progress?.("读取 PADS 容器");
  const container = new PadsContainerReader(data).read();
  const metadata = await new PadsMetadataReader(container).read(signal);
  const layerMap = new PadsLayerMap(metadata.layers);
  const padstacks = await new PadsPadstackReader(container).read(signal);
  const footprints = await new PadsFootprintReader(
    container,
    padstacks,
    metadata.placements,
  ).read(signal);
  if (footprints.unresolved.length) throw new Error("PADS 封装引用未完整解析");
  progress?.("读取 PADS 网络与接点");
  const links = await new PadsConnectivityReader(
    container,
    metadata.nets,
    footprints.footprints,
    footprints.instances,
  ).read(signal);
  const junctions = await new PadsJunctionReader(
    container,
    metadata.nets,
    footprints.footprints,
  ).read(signal);
  const pinJunctions = await new PadsPinJunctionReader(container).read(signal);
  if (junctions.unresolved.length) throw new Error("PADS Via 源定义未完整解析");
  progress?.("转换 PADS 引脚与过孔");
  const pins = await new PadsPinBuilder({
    version: container.version,
    layers: metadata.layers,
    layerMap,
    placements: metadata.placements,
    stacks: padstacks,
    ...footprints,
    junctions: pinJunctions.pins,
    assignments: links.assignments,
  }).build(signal);
  const vias = await new PadsViaBuilder({
    version: container.version,
    layers: metadata.layers,
    layerMap,
    stacks: padstacks,
    footprints: footprints.footprints,
    junctions: junctions.vias,
  }).build(signal);
  progress?.("转换 PADS 走线");
  const routes = await new PadsRouteReader(
    container,
    metadata.layers,
    junctions.handles,
  ).read(signal);
  const segments = await new PadsRouteBuilder(
    routes.routes,
    metadata.layers,
    layerMap,
  ).build(signal);
  const colors = [
    "#58b5ed",
    "#83ce94",
    "#edb963",
    "#ba8bec",
    "#eb819d",
    "#54c7bd",
  ];
  const copperLayers = layerMap.copper;
  const extent = new BoundsAccumulator();
  const scene: BoardScene = {
    layers: copperLayers.map((layer, id) => ({
      id,
      name: layer.name.text ?? `Layer ${layer.id}`,
      color: colors[id % colors.length],
      layerFunction: "conductor",
    })),
    nets: new Map(
      metadata.nets
        .filter((net) => net.name.raw.length)
        .map((net) => [net.ordinal + 1, net.name.text ?? `Net ${net.ordinal}`]),
    ),
    segments,
    pins: pins.pins,
    vias: vias.vias,
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: extent.bounds,
    diagnostics: [
      ...metadata.diagnostics,
      ...footprints.diagnostics,
      ...pins.diagnostics,
      ...vias.diagnostics,
      "PADS 场景尚未接入普通图形和文字",
    ],
  };
  for (const entry of links.unresolved)
    scene.diagnostics.push(
      `PADS 网络端点未解析 ${entry.placement}:${entry.terminal}`,
    );
  const pause = cooperative(signal);
  let count = 0;
  for (const owner of [...scene.pins, ...scene.vias]) {
    if (count++ % 256 === 0) {
      const pending = pause();
      if (pending) await pending;
    }
    extent.includePadOwner(owner);
  }
  for (const segment of segments) {
    if (count++ % 512 === 0) {
      const pending = pause();
      if (pending) await pending;
    }
    extent.includeSegment(segment);
  }
  progress?.("读取 PADS 板框");
  const outlines = await new PadsOutlineReader(container).read(signal);
  scene.outline = await new PadsOutlineBuilder(outlines).build(signal);
  for (const segment of scene.outline) {
    const pending = pause();
    if (pending) await pending;
    extent.includeSegment(segment);
  }
  if (!outlines.outlines.length)
    scene.diagnostics.push(
      "PADS 源文件没有专用板框记录，实际外形仍待从普通图形确认",
    );
  progress?.("读取 PADS 铜区");
  const pours = await new PadsPourReader(container).read(signal);
  const pourGroups = await new PadsPourLinkReader(pours.owners).read(signal);
  const netEvidence = await new PadsPourNetResolver(
    pours.owners,
    pourGroups,
    metadata.nets,
    junctions.handles,
  ).resolve(signal);
  const copper = await new PadsCopperBuilder(
    pours,
    pourGroups,
    netEvidence.ownerNets,
  ).build(signal);
  if (copper.diagnostics.length)
    throw new Error(
      `PADS ${copper.diagnostics.length} 个铜区无法转换：${copper.diagnostics[0].error}`,
    );
  if (netEvidence.unwitnessed.length)
    scene.diagnostics.push(
      `PADS ${netEvidence.unwitnessed.length} 个热连接接点缺少独立网络证据，沿用铺铜网络`,
    );
  if (copper.boundaryOnly.length)
    scene.diagnostics.push(
      `PADS ${copper.boundaryOnly.length} 个设计铜区没有已保存填充，暂不重新铺铜`,
    );
  const displayLayerIds = layerMap.physical;
  progress?.("构建 PADS 铜区几何");
  const fillDisplayLayers = copper.fills.map((fill) => {
    const displayLayer = displayLayerIds.get(fill.layer);
    if (displayLayer === undefined)
      throw new Error(`PADS 铜区层号无效 ${fill.layer}`);
    return displayLayer;
  });
  progress?.(`构建 PADS 铜区 · 0/${copper.fills.length}`);
  const meshes = await new PadsCopperBatch(copper.fills).build(
    signal,
    (completed) => {
      if (completed % 16 === 0 || completed === copper.fills.length)
        progress?.(`构建 PADS 铜区 · ${completed}/${copper.fills.length}`);
    },
  );
  for (let fillIndex = 0; fillIndex < copper.fills.length; fillIndex++) {
    const fill = copper.fills[fillIndex];
    const pending = pause();
    if (pending) await pending;
    const layer = fillDisplayLayers[fillIndex];
    for (const mesh of meshes[fillIndex]) {
      const zone = copperZoneFromMesh(
        {
          id: 0x50000000 + scene.zones.length,
          layer,
          net: fill.net === null ? 0 : fill.net + 1,
        },
        mesh,
      );
      scene.zones.push(zone);
      extent.includeZone(zone);
    }
  }
  if (!Object.values(scene.bounds).every(Number.isFinite))
    throw new Error("PADS 场景没有有限几何范围");
  const info: PadsInfo = {
    version: container.version,
    incomplete: true,
    sourcePins: pinJunctions.pins.length,
    sourceVias: junctions.vias.length,
    viaAliases: vias.aliases,
    sourceRoutes: routes.routes.length,
    sourceCopperFills: copper.fills.length,
    sourceCopperZones: scene.zones.length,
    sourceOutlines: outlines.outlines.length,
    sourceOutlineSegments: scene.outline.length,
    auxiliaryRoutes: routes.auxiliary,
    unresolvedNetworks: links.unresolved,
    fallbackPinNames: pins.fallbackNames,
  };
  return { scene, info };
}
