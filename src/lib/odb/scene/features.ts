import type { Bounds, Point } from "../../board/model";
import { cooperative } from "../../cooperative";
import { PadShape as BoardPadShape } from "../../board/shapes/pad";
import { ShapeTransform } from "../../board/shapes/transform";
import { odbSegment, OdbFeatureReader } from "../features";
import { contourIslands, type OdbSymbolReader } from "../symbols";
import type { OdbConnectivityReader } from "../connectivity";
import type { OdbLayerInfo } from "../import";
import type { OdbSceneContext } from "./context";
import { isOdbCopper as isCopper } from "./layers";

interface OdbFeatureInput {
  layers: OdbLayerInfo[];
  copper: OdbLayerInfo[];
  graphics: OdbLayerInfo[];
  copperIds: Map<string, number>;
  symbols: OdbSymbolReader;
  connectivity: Awaited<ReturnType<OdbConnectivityReader["read"]>>;
  archive: { text(path: string, required?: boolean): string };
  step: string;
  units: string;
}

export async function buildOdbFeatures(
  context: OdbSceneContext,
  input: OdbFeatureInput,
  progress?: (phase: string) => void,
) {
  const {
    layers,
    copper,
    graphics,
    copperIds,
    symbols,
    connectivity,
    archive,
    step,
    units,
  } = input;
  const { scene, extent, signal, addSegment, addZone } = context;
  const { owner, attachPad, setDrill } = context.pads;
  const pause = cooperative(signal);
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
          extent.includeSegment(s);
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
          extent.includePad(hole, { ...shape, layer: -1 });
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
  return { features, copperBounds };
}
