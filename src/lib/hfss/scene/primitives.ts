import type { Segment } from "../../board/model";
import { BOND_WIRE_TOP_LAYER } from "../../board/layers";
import { createCopperZone } from "../../board/copper-zone";
import { parserError } from "../../parser-error";
import { defPolygonPath, defPrimitivePath } from "../geometry";
import {
  defPrimitiveInfo,
  defObject,
  defNumber,
  defInteger,
  defText,
} from "../metadata/layout";
import type { HfssSceneContext } from "./context";

export async function buildHfssPrimitives(context: HfssSceneContext) {
  const { source, scene, extent, layerIds, netId, components, pause, signal } =
    context;
  let processed = 0;
  for (const primitive of source.primitives.values()) {
    if (++processed % 256 === 0) {
      const pending = pause();
      if (pending) await pending;
    }
    const info = defPrimitiveInfo(primitive);
    if (info.parent !== -1) continue;
    const layer = layerIds.get(info.layer),
      net = netId(info.net);
    if (primitive.schema === 16) {
      if (source.layers.get(info.layer)?.type !== "wirebond")
        throw parserError("hfssInvalidBondWireLayer", { detail: info.id });
      const path = defObject(primitive.fields[0], 14),
        width = defNumber(path.fields[4]) * 1000,
        profile = defText(primitive.fields[1]),
        material = defText(primitive.fields[3]);
      if (width <= 0 || source.voids.has(info.id))
        throw parserError("hfssInvalidBondWireGeometry", { detail: info.id });
      if (!scene.specialLayers)
        scene.specialLayers = [
          {
            id: BOND_WIRE_TOP_LAYER,
            name: source.layers.get(info.layer)!.name,
            color: "#e4d95b",
            kind: "bond-wire",
            category: "bond-wire",
          },
        ];
      const trackId = context.nextId();
      for (const segment of defPolygonPath(defObject(path.fields[6], 36))) {
        Object.assign(segment, {
          id: context.nextId(),
          trackId,
          layer: BOND_WIRE_TOP_LAYER,
          net,
          width,
          bondWire: {
            profile,
            material,
            sourcePin: -1,
            finger: -1,
            reference: components.get(info.component) ?? "",
            pinName: "",
          },
        });
        scene.segments.push(segment);
        extent.includeSegment(segment);
      }
      continue;
    }
    if (
      source.layers.get(info.layer)?.type === "outline" &&
      primitive.schema === 14
    ) {
      const width = defNumber(primitive.fields[4]) * 1000;
      if (width < 0) throw parserError("hfssInvalidOutlineWidth");
      for (const segment of defPolygonPath(
        defObject(primitive.fields[6], 36),
      )) {
        Object.assign(segment, {
          id: context.nextId(),
          trackId: 0,
          layer: -1,
          net: 0,
          width,
        });
        segment.trackId = segment.id;
        scene.outline.push(segment);
        extent.includeSegment(segment);
      }
      continue;
    }
    if (
      source.layers.get(info.layer)?.type === "outline" &&
      primitive.schema !== 14
    ) {
      const polygons = [primitive, ...(source.voids.get(info.id) ?? [])];
      for (const polygon of polygons)
        for (const segment of defPrimitivePath(polygon)) {
          Object.assign(segment, {
            id: context.nextId(),
            trackId: 0,
            layer: -1,
            net: 0,
          });
          segment.trackId = segment.id;
          scene.outline.push(segment);
          extent.includeSegment(segment);
        }
      continue;
    }
    if (layer === undefined)
      throw parserError("hfssUnsupportedNoncopperLayer", {
        detail: source.layers.get(info.layer)?.name ?? "",
      });
    if (primitive.schema === 14) {
      if ([1, 2, 3].some((i) => defInteger(primitive.fields[i]) !== 0))
        throw parserError("hfssNonroundTraceUnsupported");
      if (source.voids.has(info.id))
        throw parserError("hfssVoidedTraceUnsupported");
      const width = defNumber(primitive.fields[4]) * 1000,
        trackId = context.nextId();
      if (width < 0) throw parserError("hfssInvalidTraceWidth");
      for (const segment of defPolygonPath(
        defObject(primitive.fields[6], 36),
      )) {
        Object.assign(segment, {
          id: context.nextId(),
          trackId,
          layer,
          net,
          width,
        });
        scene.segments.push(segment);
        extent.includeSegment(segment);
      }
    } else if ([12, 13, 15].includes(primitive.schema)) {
      const paths: Segment[][] = [defPrimitivePath(primitive)];
      for (const hole of source.voids.get(info.id) ?? []) {
        paths.push(defPrimitivePath(hole));
      }
      if (!paths[0].length)
        throw parserError("hfssEmptyCopperArea", { detail: info.id });
      const id = context.nextId();
      for (const path of paths)
        for (const segment of path) {
          Object.assign(segment, { id, trackId: id, layer, net });
          extent.includeSegment(segment);
        }
      scene.zones.push(
        await createCopperZone({ id, layer, net, paths }, signal),
      );
    } else
      throw parserError("hfssUnverifiedPrimitiveConversion", {
        detail: primitive.schema,
      });
  }
}
