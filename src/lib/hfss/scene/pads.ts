import type { PadShape, Point, Pin, Via } from "../../board/model";
import { BOND_TOP_LAYER } from "../../board/layers";
import { PointShape } from "../../board/shapes/point";
import { PadShape as BoardPadShape } from "../../board/shapes/pad";
import { PathShape } from "../../board/shapes/path";
import { ShapeTransform } from "../../board/shapes/transform";
import { parserError } from "../../parser-error";
import { defArray, defObject } from "../metadata/layout";
import {
  defPadInstance,
  defPadShape,
  defDrill,
  type DefPadstacks,
} from "../metadata/padstack";
import type { HfssSceneContext } from "./context";

export async function buildHfssPads(
  context: HfssSceneContext,
  padstacks: DefPadstacks,
) {
  const { source, scene, extent, copper, layerIds, netId, components, pause } =
    context;
  let processed = 0;
  const shapeCache = new Map<number, PadShape[]>();
  for (const value of defArray(source.layout.fields[5])) {
    if (++processed % 256 === 0) {
      const pending = pause();
      if (pending) await pending;
    }
    const pad = defPadInstance(defObject(value, 19), padstacks),
      binding = pad.binding;
    let templates = shapeCache.get(binding.id);
    if (!templates) {
      templates = [];
      if (binding.die) {
        const sourceLayer = binding.definition.layers.get(binding.first)!;
        const shape = defPadShape(sourceLayer.pad, BOND_TOP_LAYER);
        if (shape) templates.push(shape);
      } else {
        for (const copperLayer of copper) {
          if (!binding.usedLayers.has(copperLayer.id)) continue;
          const definitionLayerId = binding.forward[copperLayer.id] ?? -1;
          if (definitionLayerId === -1) continue;
          const definitionLayer =
            binding.definition.layers.get(definitionLayerId)!;
          const shape = defPadShape(
            definitionLayer.pad,
            layerIds.get(copperLayer.id)!,
          );
          if (shape) templates.push(shape);
        }
      }
      shapeCache.set(binding.id, templates);
    }
    if (
      binding.die &&
      !scene.specialLayers?.some((layer) => layer.id === BOND_TOP_LAYER)
    ) {
      scene.specialLayers ??= [];
      scene.specialLayers.push({
        id: BOND_TOP_LAYER,
        name: "BOND TOP",
        color: "#d7cd58",
        kind: "die-pad",
        category: "etch",
      });
    }
    const hole = defDrill(binding.definition.hole),
      drill = hole.height;
    // `flp` is binding metadata, not an additional planar reflection. Native
    // GetGeometries confirms that mirrored definitions already store their
    // final local shape; applying flp again reflects them a second time.
    const holeOffset = new PointShape(hole.offset).rotate(pad.rotation);
    const at: Point = [
      pad.x * 1000 + holeOffset[0],
      pad.y * 1000 + holeOffset[1],
    ];
    const shapes = templates.map((shape) => {
      const offset = new PointShape(shape.offset).rotate(pad.rotation);
      const result = {
        ...shape,
        offset: [offset[0] - holeOffset[0], offset[1] - holeOffset[1]] as Point,
      };
      if (hole.angle !== 0 && shape.type !== 2) {
        const paths = new BoardPadShape(shape)
          .paths()
          .map((path) =>
            path.map((s) =>
              new ShapeTransform([0, 0], -hole.angle, false).segment(s),
            ),
          );
        result.customPaths = paths;
        result.custom = paths.map((path) => new PathShape(path).flatten());
      }
      return result;
    });
    const reference = pad.component === -1 ? "" : components.get(pad.component);
    if (reference === undefined)
      throw parserError("hfssPadMissingComponent", { detail: pad.component });
    const id = context.nextId(),
      net = netId(pad.net);
    let owner: Pin | Via;
    const angle = pad.rotation + hole.angle;
    if (pad.pin || binding.die) {
      owner = {
        id,
        net,
        name: pad.name,
        reference,
        at,
        angle,
        back: false,
        drill,
        shapes,
      };
      if (binding.die)
        owner.die = {
          sourceReference: binding.id,
          padstackName: binding.definition.name,
        };
      scene.pins.push(owner);
    } else {
      const first = layerIds.get(binding.first),
        last = layerIds.get(binding.last);
      if (first === undefined || last === undefined)
        throw parserError("hfssDrillEndsNotConductors");
      owner = {
        id,
        net,
        at,
        angle,
        back: false,
        drill,
        padstack: binding.definition.id,
        padstackName: binding.definition.name,
        startLayer: Math.min(first, last),
        endLayer: Math.max(first, last),
        pads: shapes,
      };
      scene.vias.push(owner);
    }
    if (drill > 0)
      owner.drillShape = {
        width: hole.width,
        height: hole.height,
        plated: Number(binding.definition.source.properties.get("plt")) > 0,
      };
    extent.includePadOwner(owner);
  }
}
