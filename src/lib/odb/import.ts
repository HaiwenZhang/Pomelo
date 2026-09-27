import { CopperMesh } from "../board/copper-mesh";
import type {
  BoardScene,
  Bounds,
  PadShape,
  Pin,
  Point,
  Segment,
  SpecialLayer,
  Via,
} from "../board/model";
import { PadShape as PadShapeGeometry } from "../board/shapes/pad";
import { PathShape } from "../board/shapes/path";
import { SegmentShape } from "../board/shapes/segment";
import { cooperative } from "../cooperative";
import { OdbArchiveReader } from "./archive";
import { OdbConnectivityReader, type Subnet } from "./connectivity";
import { odbSegment, OdbFeatureReader } from "./features";
import { PadShape as BoardPadShape } from "../board/shapes/pad";
import { ShapeTransform } from "../board/shapes/transform";
import { contourIslands, OdbSymbolReader } from "./symbols";
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
const isCopper = (type: string) =>
  ["SIGNAL", "POWER_GROUND", "MIXED"].includes(type);
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
    bounds: {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    },
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
  const symbols = new OdbSymbolReader(archive, units, signal),
    pause = cooperative(signal);
  const owners = new Map<number, Pin | Via>();
  let objectId = 1;
  const include = (b: Bounds) => {
    scene.bounds.minX = Math.min(scene.bounds.minX, b.minX);
    scene.bounds.minY = Math.min(scene.bounds.minY, b.minY);
    scene.bounds.maxX = Math.max(scene.bounds.maxX, b.maxX);
    scene.bounds.maxY = Math.max(scene.bounds.maxY, b.maxY);
  };
  const addSegment = (
    s: Segment,
    layer: number,
    net: number,
    outline = false,
  ) => {
    s.id = objectId++;
    s.trackId = s.id;
    s.layer = layer;
    s.net = net;
    (outline ? scene.outline : scene.segments).push(s);
    include(new SegmentShape(s).bounds());
  };
  const addZone = async (
    paths: Segment[][],
    layer: number,
    net: number,
    flattened?: Point[][],
  ) => {
    if (!paths[0]?.length) return;
    const id = objectId++,
      rings = flattened ?? paths.map((path) => new PathShape(path).flatten());
    if (rings[0].length < 3) return;
    for (const path of paths)
      for (const s of path) {
        s.id = id;
        s.trackId = id;
        s.layer = layer;
        s.net = net;
        include(new SegmentShape(s).bounds());
      }
    const mesh = await new CopperMesh(rings).build(signal, paths);
    scene.zones.push({ id, layer, net, paths, rings: [], ...mesh });
  };
  function owner(
    subnet: Subnet | undefined,
    at: Point,
    angle: number,
    mirror: boolean,
  ): Pin | Via {
    const existing = subnet && owners.get(subnet.id);
    if (existing) return existing;
    const net = subnet?.net ?? 0,
      id = objectId++;
    at = subnet?.toeprint?.at ?? at;
    let result: Pin | Via;
    if (subnet?.kind === "VIA") {
      result = {
        id,
        net,
        at,
        angle,
        back: mirror,
        padstack: subnet.id,
        drill: 0,
        startLayer: 0,
        endLayer: copper.length - 1,
        pads: [],
      };
      scene.vias.push(result);
    } else {
      result = {
        id,
        net,
        at,
        angle,
        back: mirror,
        reference: subnet?.toeprint?.reference ?? "",
        name: subnet?.toeprint?.name ?? "",
        drill: 0,
        shapes: [],
      };
      scene.pins.push(result);
    }
    if (subnet && (subnet.kind === "VIA" || subnet.kind === "TOP"))
      owners.set(subnet.id, result);
    return result;
  }
  function attachPad(
    target: Pin | Via,
    pad: PadShape,
    at: Point,
    angle: number,
    mirror: boolean,
    layer: number,
  ) {
    let shape: PadShape;
    const offset: Point = [at[0] - target.at[0], at[1] - target.at[1]];
    if (
      Math.abs(angle - (target.angle ?? 0)) < 1e-10 &&
      mirror === !!target.back
    )
      shape = { ...pad, layer, offset };
    else {
      // Store a path in owner-local coordinates when two layer apertures have
      // different orientations. Keep analytic arcs rather than flattening them.
      const placement = new ShapeTransform([0, 0], angle, mirror);
      const owner = new ShapeTransform(
        [0, 0],
        target.back ? (target.angle ?? 0) : -(target.angle ?? 0),
        !!target.back,
      );
      const paths = new BoardPadShape(pad)
        .paths()
        .map((path) => path.map((s) => owner.segment(placement.segment(s))));
      shape = {
        ...pad,
        type: 22,
        layer,
        offset,
        customPaths: paths,
        custom: paths.map((p) => new PathShape(p).flatten()),
      };
    }
    ("pads" in target ? target.pads : target.shapes).push(shape);
    include(new PadShapeGeometry(shape).bounds(target));
  }
  function setDrill(
    target: Pin | Via,
    at: Point,
    angle: number,
    mirror: boolean,
    width: number,
    height: number,
    plated: boolean,
  ) {
    const oldAt = target.at,
      oldAngle = target.angle ?? 0,
      oldBack = !!target.back,
      list = "pads" in target ? target.pads : target.shapes,
      oldPads = [...list];
    // Re-anchor the owner to the true hole, retaining every layer's eccentric
    // pad offset and orientation. A drill must not move its copper apertures.
    if (width === height) {
      angle = oldAngle;
      mirror = oldBack;
    }
    target.at = at;
    target.angle = angle;
    target.back = mirror;
    list.length = 0;
    for (const pad of oldPads)
      attachPad(
        target,
        { ...pad, offset: [0, 0] },
        [oldAt[0] + pad.offset[0], oldAt[1] + pad.offset[1]],
        oldAngle,
        oldBack,
        pad.layer,
      );
    target.drill = width;
    target.drillShape = { width, height, plated };
  }
  // Copper before drill permits holes to attach to the already placed owner.
  const ordered = [
    ...copper,
    ...layers.filter((l) => l.type === "DRILL"),
    ...graphics.filter((l) => l.type !== "DRILL"),
    ...layers.filter((l) => ["DIELECTRIC", "COMPONENT"].includes(l.type)),
  ];
  let features = 0,
    copperBounds: Bounds | undefined;
  for (const layer of ordered) {
    if (!isCopper(layer.type) && !copperBounds)
      copperBounds = { ...scene.bounds };
    signal?.throwIfAborted();
    progress?.(`读取 ODB++ 图层 · ${layer.name}`);
    const text = archive.text(
        `steps/${step}/layers/${layer.name}/features`,
        false,
      ),
      mappings = connectivity.features.get(layer.name),
      seen = new Set<number>();
    for (const feature of new OdbFeatureReader(text, units).steps(signal)) {
      if (!feature) {
        const pending = pause();
        if (pending) await pending;
        continue;
      }
      layer.features++;
      features++;
      const subnet = mappings?.get(feature.index),
        net = subnet?.net ?? 0;
      if (subnet) seen.add(feature.index);
      if (layer.displayLayer === undefined && layer.type !== "DRILL")
        throw new Error(
          `ODB++ ${layer.type} 层含有未支持的图元：${layer.name}`,
        );
      const displayLayer = layer.displayLayer ?? -1;
      if (feature.kind === "surface") {
        if (layer.type === "DRILL")
          throw new Error(`ODB++ 钻孔面域尚未支持：${layer.name}`);
        for (const island of contourIslands(feature.contours))
          await addZone(island.paths, displayLayer, net, island.rings);
      } else if (feature.kind === "line") {
        const cached = symbols.read(feature.symbol),
          symbol = cached instanceof Promise ? await cached : cached;
        if (
          symbol.pads.length !== 1 ||
          symbol.pads[0].type !== 2 ||
          symbol.strokes.length
        )
          throw new Error(`ODB++ 非圆线刷：${feature.symbol.name}`);
        feature.segment.width = symbol.pads[0].width;
        if (layer.type === "DRILL") {
          if (feature.segment.width === 0) {
            addSegment(feature.segment, displayLayer, net);
            continue;
          }
          if (feature.segment.arc)
            throw new Error(`ODB++ 弧形槽孔尚未支持：${layer.name}`);
          const s = feature.segment,
            at: Point = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2],
            angle = Math.atan2(s.b[1] - s.a[1], s.b[0] - s.a[0]);
          const hole = owner(subnet, at, angle, false);
          setDrill(
            hole,
            at,
            angle,
            false,
            Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) + s.width,
            s.width,
            feature.attributes.get(".drill") !== "1",
          );
          include(new SegmentShape(s).bounds());
        } else addSegment(feature.segment, displayLayer, net);
      } else {
        const cached = symbols.read(feature.symbol),
          symbol = cached instanceof Promise ? await cached : cached;
        if (layer.type === "DRILL") {
          if (
            symbol.pads.length !== 1 ||
            ![2, 11].includes(symbol.pads[0].type) ||
            symbol.strokes.length
          )
            throw new Error(`ODB++ 不支持的孔形：${feature.symbol.name}`);
          const hole = owner(subnet, feature.at, feature.angle, feature.mirror),
            shape = symbol.pads[0];
          setDrill(
            hole,
            feature.at,
            feature.angle,
            feature.mirror,
            shape.width,
            shape.height,
            feature.attributes.get(".drill") !== "1",
          );
          if ("pads" in hole) {
            const start = copperIds.get(layer.start),
              end = copperIds.get(layer.end);
            if (start === undefined || end === undefined)
              throw new Error(`ODB++ 钻孔跨度缺失：${layer.name}`);
            hole.startLayer = start;
            hole.endLayer = end;
          }
          include(new PadShapeGeometry({ ...shape, layer: -1 }).bounds(hole));
        } else if (isCopper(layer.type)) {
          const target = owner(
            subnet,
            feature.at,
            feature.angle,
            feature.mirror,
          );
          for (const pad of symbol.pads)
            attachPad(
              target,
              pad,
              feature.at,
              feature.angle,
              feature.mirror,
              displayLayer,
            );
          for (const stroke of symbol.strokes)
            addSegment(
              new ShapeTransform(
                feature.at,
                feature.angle,
                feature.mirror,
              ).segment(stroke),
              displayLayer,
              net,
            );
        } else {
          for (const pad of symbol.pads) {
            if (pad.type === 25) {
              // A graphical annulus is exactly a stroked full circle. Preserve
              // its analytic radii rather than expanding hundreds of thousands
              // of repeated documentation circles into tessellated copper meshes.
              const radius = (pad.width + pad.innerDiameter!) / 4,
                width = (pad.width - pad.innerDiameter!) / 2;
              addSegment(
                new ShapeTransform(
                  feature.at,
                  feature.angle,
                  feature.mirror,
                ).segment(odbSegment([radius, 0], [radius, 0], width, [0, 0])),
                displayLayer,
                net,
              );
            } else
              await addZone(
                new BoardPadShape(pad)
                  .paths()
                  .map((path) =>
                    path.map((s) =>
                      new ShapeTransform(
                        feature.at,
                        feature.angle,
                        feature.mirror,
                      ).segment(s),
                    ),
                  ),
                displayLayer,
                net,
              );
          }
          for (const stroke of symbol.strokes)
            addSegment(
              new ShapeTransform(
                feature.at,
                feature.angle,
                feature.mirror,
              ).segment(stroke),
              displayLayer,
              net,
            );
        }
      }
      const pending = pause();
      if (pending) await pending;
    }
    if (mappings && seen.size !== mappings.size)
      throw new Error(
        `ODB++ ${layer.name} 有 ${mappings.size - seen.size} 条未解析的网络图元引用`,
      );
    connectivity.features.delete(layer.name);
  }
  if (connectivity.features.size)
    throw new Error(
      `ODB++ EDA 引用了 matrix 中未定义的层：${[...connectivity.features.keys()].join(", ")}`,
    );
  const sourceBounds = { ...scene.bounds };
  // Manufacturing tables may be far outside the PCB. Keep their geometry and
  // extents, but fit the actual board (copper + profile) on initial open.
  if (copperBounds && Number.isFinite(copperBounds.minX))
    scene.bounds = copperBounds;
  progress?.("读取 ODB++ 板框");
  for await (const feature of new OdbFeatureReader(
    archive.text(`steps/${step}/profile`),
    units,
  ).read(signal)) {
    if (feature.kind !== "surface") throw new Error("ODB++ profile 不是面域");
    for (const contour of feature.contours)
      for (const s of contour.path) addSegment(s, -1, 0, true);
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
