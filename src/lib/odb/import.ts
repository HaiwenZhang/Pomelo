import { OdbSceneContext } from "./scene/context";
import { buildOdbFeatures } from "./scene/features";
import { isOdbCopper as isCopper } from "./scene/layers";
import { BoundsAccumulator } from "../board/bounds";

import type { BoardScene, Bounds, SpecialLayer } from "../board/model";

import { OdbArchiveReader } from "./archive";
import { OdbConnectivityReader } from "./connectivity";
import { OdbFeatureReader } from "./features";

import { OdbSymbolReader } from "./symbols";
import { blocks, fields, unitScale } from "./text";
export interface OdbLayerInfo {
  name: string;
  type: string;
  context: string;
  row: number;
  start: string;
  end: string;
  displayLayer?: number;
  features: number;
}
export interface OdbInfo {
  version: string;
  source: string;
  step: string;
  units: string;
  archiveFiles: number;
  expandedBytes: number;
  layers: OdbLayerInfo[];
  features: number;
  sourceBounds: Bounds;
  opaqueProperties: {
    path: string;
    offset: number;
    bytes: Uint8Array;
  }[];
}
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
/** ODB++ import supplies format-independent board geometry. */
export async function importOdb(
  buffer: ArrayBuffer,
  signal?: AbortSignal,
  progress?: (phase: string) => void,
): Promise<{
  scene: BoardScene;
  info: OdbInfo;
}> {
  const archive = await new OdbArchiveReader(buffer).read(signal, progress),
    meta = fields(archive.text("misc/info", false));
  const matrix = archive.text("matrix/matrix"),
    steps = blocks(matrix, "STEP");
  if (steps.length !== 1)
    throw new Error(`ODB++ 当前需要单个板级 step，归档包含 ${steps.length} 个`);
  const step = steps[0].NAME.toLowerCase(),
    header = fields(archive.text(`steps/${step}/stephdr`));
  if (/STEP-REPEAT\s*\{/.test(archive.text(`steps/${step}/stephdr`)))
    throw new Error("ODB++ 拼板 step-repeat 尚未支持");
  const units = header.UNITS || meta.UNITS || "INCH";
  unitScale(units);
  const layerRecords = blocks(matrix, "LAYER").sort(
    (a, b) => Number(a.ROW) - Number(b.ROW),
  );
  const layers: OdbLayerInfo[] = layerRecords.map((l) => {
    if (l.POLARITY && l.POLARITY !== "POSITIVE")
      throw new Error(`ODB++ 负片层尚未支持：${l.NAME}`);
    return {
      name: l.NAME.toLowerCase(),
      type: l.TYPE,
      context: l.CONTEXT,
      row: Number(l.ROW),
      start: l.START_NAME?.toLowerCase() ?? "",
      end: l.END_NAME?.toLowerCase() ?? "",
      features: 0,
    };
  });
  if (new Set(layers.map((l) => l.name)).size !== layers.length)
    throw new Error("ODB++ 重复层名");
  const copper = layers.filter((l) => isCopper(l.type)),
    copperIds = new Map(copper.map((l, i) => [l.name, i]));
  if (!copper.length) throw new Error("ODB++ 没有导体层");
  copper.forEach((l, i) => (l.displayLayer = i));
  // Extra graphical layers keep their source type and do not change physical
  // copper numbering.
  const graphics = layers.filter(
    (l) => !isCopper(l.type) && !["DIELECTRIC", "COMPONENT"].includes(l.type),
  );
  graphics.forEach((l, i) => (l.displayLayer = 0x30000 + i));
  const extent = new BoundsAccumulator();
  const scene: BoardScene = {
    layers: copper.map((l, id) => ({
      id,
      name: layerRecords.find((r) => r.NAME.toLowerCase() === l.name)!.NAME,
      color: colors[id % colors.length],
      layerFunction: l.type === "POWER_GROUND" ? "plane" : "conductor",
    })),
    specialLayers: graphics.map((l, index): SpecialLayer => ({
      id: 0x30000 + index,
      name: `${l.type} / ${l.name}`,
      color: l.type === "SILK_SCREEN" ? "#e4dfcc" : "#94b0ba",
      kind: "graphic",
      category: "etch",
    })),
    nets: new Map(),
    segments: [],
    pins: [],
    vias: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: extent.bounds,
    diagnostics: [],
  };
  for (const l of graphics)
    scene.drawingLayers.push({
      id: l.displayLayer!,
      name: `${l.type} / ${l.name}`,
      color: "#94b0ba",
      defaultVisible:
        l.type === "SILK_SCREEN" && !/bot|bottom|ssb/.test(l.name),
    });
  progress?.("读取 ODB++ 网络与器件");
  const connectivity = await new OdbConnectivityReader(
    archive,
    step,
    units,
  ).read(signal);
  scene.nets = connectivity.nets;
  const symbols = new OdbSymbolReader(archive, units, signal);
  const context = new OdbSceneContext(scene, extent, signal);
  const { features, copperBounds } = await buildOdbFeatures(
    context,
    {
      layers,
      copper,
      graphics,
      copperIds,
      symbols,
      connectivity,
      archive,
      step,
      units,
    },
    progress,
  );
  const sourceBounds = { ...scene.bounds };
  // Manufacturing tables may be far outside the PCB. Keep their geometry and
  // extents, but fit the actual board (copper + profile) on initial open.
  if (copperBounds && Number.isFinite(copperBounds.minX))
    extent.reset(copperBounds);
  progress?.("读取 ODB++ 板框");
  for await (const feature of new OdbFeatureReader(
    archive.text(`steps/${step}/profile`),
    units,
  ).read(signal)) {
    if (feature.kind !== "surface") throw new Error("ODB++ profile 不是面域");
    for (const contour of feature.contours)
      for (const s of contour.path) context.addSegment(s, -1, 0, true);
  }
  if (!Number.isFinite(scene.bounds.minX))
    throw new Error("ODB++ 没有可显示的几何");
  signal?.throwIfAborted();
  if (archive.opaqueProperties.length)
    scene.diagnostics.push(
      `ODB++ 保留 ${archive.opaqueProperties.length} 条非 UTF-8 说明属性的原始字节；几何、位号和网络已按独立记录读取。`,
    );
  return {
    scene,
    info: {
      version: `${meta.ODB_VERSION_MAJOR || "?"}.${meta.ODB_VERSION_MINOR || "0"}`,
      source: meta.ODB_SOURCE || meta.SAVE_APP || "",
      step,
      units,
      archiveFiles: archive.files.size,
      expandedBytes: archive.bytes,
      layers,
      features,
      sourceBounds,
      opaqueProperties: archive.opaqueProperties,
    },
  };
}
