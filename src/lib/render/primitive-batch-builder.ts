import { BoardDisplay } from "../board/display";
import { BoardLayers } from "../board/layers";
import type { BoardScene, PadShape, Segment } from "../board/model";
import { DrillShape } from "../board/shapes/drill";
import type { PadOwner } from "../board/shapes/pad";
import { PadShape as PadShapeGeometry } from "../board/shapes/pad";
import { ViaShape } from "../board/shapes/via";
import { ZoneShape } from "../board/shapes/zone";

import { type DisplayOptions } from "../board/display";
import { buildBoardTextBatches } from "./board-text-batch-builder";
import { buildDrawingBatches } from "./drawing-batch-builder";
import { splitPositionSteps } from "./position-precision";
import type { PrimitiveBatch } from "./primitive-batch";

import { buildArcBatchSteps } from "./arc-batch-builder";
import { copperMaterial, type ColorMode } from "./color-mode";
import { packCopperBatches } from "./copper-batch-packer";
import { buildSelectionPackets } from "./selection-packet-builder";

import { collectLayerMembers } from "./selection-layer-collector";

export type PrimitiveBuildOptions =
  | { kind: "scene" }
  | { kind: "selection"; visibility?: DisplayOptions; reuseOutlines?: boolean };

/** Builds one scene's GPU-ready packets without retaining expanded geometry. */
export class PrimitiveBatchBuilder {
  private readonly materials = new WeakMap<number[], Map<number, number[]>>();
  private readonly originX: number;
  private readonly originY: number;

  constructor(
    private readonly scene: BoardScene,
    private readonly colorMode: ColorMode | "dynamic" = "layer",
  ) {
    this.originX = (scene.bounds.minX + scene.bounds.maxX) / 2;
    this.originY = (scene.bounds.minY + scene.bounds.maxY) / 2;
  }

  private material(color: number[], net: number): number[] {
    let colors = this.materials.get(color);
    if (!colors) {
      colors = new Map();
      this.materials.set(color, colors);
    }
    let value = colors.get(net);
    if (!value) {
      value = copperMaterial(color, net, this.colorMode);
      colors.set(net, value);
    }
    return value;
  }

  private appendSegment(
    target: number[],
    segment: Segment,
    color: number[],
    outline = false,
  ): void {
    const width = outline ? 0 : segment.width;
    if (segment.arc) {
      target.push(
        segment.arc.center[0] - this.originX,
        segment.arc.center[1] - this.originY,
        segment.arc.radius,
        segment.arc.start,
        width,
        segment.arc.sweep,
        1,
        0,
        color[0],
        color[1],
        color[2],
        color[3] ?? 1,
      );
    } else {
      target.push(
        segment.a[0] - this.originX,
        segment.a[1] - this.originY,
        segment.b[0] - this.originX,
        segment.b[1] - this.originY,
        width,
        0,
        0,
        0,
        color[0],
        color[1],
        color[2],
        color[3] ?? 1,
      );
    }
  }

  private appendPad(
    target: number[],
    pad: PadShape,
    owner: PadOwner,
    color: number[],
    hole = false,
  ): void {
    const x = owner.at[0] + pad.offset[0] - this.originX;
    const y = owner.at[1] + pad.offset[1] - this.originY;
    const angle = owner.angle ?? 0;
    if (pad.type === 2)
      target.push(
        x,
        y,
        pad.width / 2,
        0,
        0,
        0,
        hole ? 3 : 2,
        0,
        color[0],
        color[1],
        color[2],
        color[3] ?? 1,
      );
    else if (pad.type === 25)
      target.push(
        x,
        y,
        pad.width / 2,
        pad.innerDiameter! / 2,
        0,
        0,
        7,
        0,
        color[0],
        color[1],
        color[2],
        color[3] ?? 1,
      );
    else if ([3, 5, 6, 11, 12, 27, 28].includes(pad.type))
      target.push(
        x,
        y,
        pad.width / 2,
        pad.height / 2,
        angle,
        new PadShapeGeometry(pad).corner(),
        hole ? 6 : [3, 28].includes(pad.type) ? 5 : 4,
        0,
        color[0],
        color[1],
        color[2],
        color[3] ?? 1,
      );
  }

  private appendCustomPad(
    fill: number[],
    edges: number[],
    pad: PadShape,
    owner: PadOwner,
    color: number[],
  ): void {
    const shape = new PadShapeGeometry(pad);
    const mesh = shape.mesh();
    for (const index of mesh.indices) {
      const point = shape.toWorld(
        [mesh.points[index * 2], mesh.points[index * 2 + 1]],
        owner,
      );
      fill.push(
        point[0] - this.originX,
        point[1] - this.originY,
        color[0],
        color[1],
        color[2],
        color[3] ?? 1,
      );
    }
    for (const edge of shape.edges(owner))
      this.appendSegment(edges, edge, color, true);
  }

  build(): PrimitiveBatch[] {
    return [...this.iterateBatches()];
  }

  /** Upload consumers can release each CPU batch before building the next one. */
  *iterateBatches(): Generator<PrimitiveBatch> {
    for (const batch of this.buildSteps()) if (batch) yield batch;
  }

  /** Undefined steps are main-thread cancellation/yield checkpoints. */
  *buildSteps(
    options: PrimitiveBuildOptions = { kind: "scene" },
  ): Generator<PrimitiveBatch | undefined> {
    if (options.kind === "scene")
      yield* packCopperBatches(this.layerSteps(true));
    // A transient hover is rebuilt on display changes. Persistent board/selection
    // geometry must retain hidden layers so toggling them needs no re-upload.
    else {
      const { visibility, reuseOutlines = false } = options;
      for (const batch of this.layerSteps(false, visibility, reuseOutlines))
        if (
          !batch ||
          !visibility ||
          BoardDisplay.isBatchVisible(visibility, batch, true)
        )
          yield batch;
    }
  }

  private *layerSteps(
    zoneFills = true,
    visibility?: DisplayOptions,
    reuseOutlines = false,
  ): Generator<PrimitiveBatch | undefined> {
    const scene = this.scene;
    let work = 0;
    const layers = new BoardLayers(scene).all();
    const members =
      layers.length > 1 ? yield* collectLayerMembers(scene) : undefined;
    const originX = this.originX,
      originY = this.originY;
    // Group source references only; expand bounded stroke batches at the layer's
    // original drawing position instead of retaining every layer's number array.
    const textByLayer = new Map<number, typeof scene.texts>();
    for (const text of scene.texts ?? []) {
      if ((++work & 255) === 0) yield;
      let group = textByLayer.get(text.layer);
      if (!group) {
        group = [];
        textByLayer.set(text.layer, group);
      }
      group.push(text);
    }
    for (const layer of layers) {
      const special = scene.specialLayers?.find((l) => l.id === layer.id);
      const pinCategory = special?.kind === "die-pad" ? "etch" : "pin";
      const segmentCategory =
        special?.kind === "bond-wire" ? "bond-wire" : "etch";
      if (visibility?.hidden?.has(layer.id)) continue;
      const color = [1, 3, 5].map(
        (i) => parseInt(layer.color.slice(i, i + 2), 16) / 255,
      );
      const lines: number[] = [],
        pads: number[] = [],
        backdrillBasePads: number[] = [],
        pins: number[] = [],
        edges: number[] = [],
        custom: number[] = [],
        customEdges: number[] = [],
        viaCustom: number[] = [],
        viaEdges: number[] = [];
      const outlineRanges: {
        id: number;
        lineStart: number;
        lineCount: number;
        arcStart: number;
        arcCount: number;
      }[] = [];
      let outlineLines = 0,
        outlineArcs = 0;
      if (!visibility || BoardDisplay.isVisible(visibility, layer.id, "zone"))
        for (const zone of members
          ? (members.zones.get(layer.id) ?? [])
          : scene.zones)
          if (zone.layer === layer.id) {
            if (zoneFills) {
              // Coordinates retain high/low precision; one instanced color serves the
              // entire copper batch instead of repeating RGBA at every vertex.
              const vertices = zone.points.length / 2,
                data = new Float32Array(vertices * 2),
                residual = new Float32Array(vertices * 2);
              for (let i = 0; i < vertices; i++) {
                if ((i & 16383) === 0) yield;
                const x = zone.points[i * 2] - originX,
                  y = zone.points[i * 2 + 1] - originY;
                data[i * 2] = x;
                data[i * 2 + 1] = y;
                residual[i * 2] = x - data[i * 2];
                residual[i * 2 + 1] = y - data[i * 2 + 1];
              }
              yield {
                layer: layer.id,
                category: "zone",
                triangles: true,
                zones: [
                  {
                    id: zone.id,
                    start: 0,
                    count: zone.indices.length,
                    outerCount: zone.outerCount,
                    bounds: new ZoneShape(zone).bounds(),
                  },
                ],
                data,
                residual,
                indices: zone.indices,
                color: new Float32Array([...this.material(color, zone.net)]),
                bounds: new ZoneShape(zone).bounds(),
                holeChunks: zone.holeChunks,
              };
            } else {
              // Keep borrowed fills in the original submission order.
              yield {
                layer: layer.id,
                category: "zone",
                data: new Float32Array(0),
                residual: new Float32Array(0),
                zones: [{ id: zone.id, start: 0, count: 0 }],
              };
            }
            const lineStart = outlineLines,
              arcStart = outlineArcs;
            if (!reuseOutlines) {
              if (zone.paths.length) {
                for (const path of zone.paths)
                  for (const segment of path) {
                    this.appendSegment(
                      edges,
                      segment,
                      this.material(color, zone.net),
                      true,
                    );
                    if (segment.arc) outlineArcs++;
                    else outlineLines++;
                    if ((++work & 2047) === 0) yield;
                  }
              } else {
                // Saved polygon fills retain their boundaries in the compact
                // mesh. Draw ring edges, never triangulation edges/diagonals.
                const shape = new ZoneShape(zone);
                let vertexOffset = 0;
                for (
                  let ringIndex = 0;
                  ringIndex < shape.ringCount();
                  ringIndex++
                ) {
                  const ring = shape.ringCoordinates(ringIndex);
                  for (let i = 0; i < ring.length; i += 2) {
                    if (!shape.isBoundaryEdge(vertexOffset + i / 2)) continue;
                    const next = (i + 2) % ring.length;
                    edges.push(
                      ring[i] - originX,
                      ring[i + 1] - originY,
                      ring[next] - originX,
                      ring[next + 1] - originY,
                      0,
                      0,
                      0,
                      0,
                      ...this.material(color, zone.net),
                    );
                    outlineLines++;
                    if ((++work & 2047) === 0) yield;
                  }
                  vertexOffset += ring.length / 2;
                }
              }
            }
            outlineRanges.push({
              id: zone.id,
              lineStart,
              lineCount: outlineLines - lineStart,
              arcStart,
              arcCount: outlineArcs - arcStart,
            });
          }
      if (
        !visibility ||
        BoardDisplay.isVisible(visibility, layer.id, pinCategory)
      )
        for (const pin of members
          ? (members.pins.get(layer.id) ?? [])
          : scene.pins) {
          if ((++work & 511) === 0) yield;
          for (const pad of pin.shapes)
            if (pad.layer === layer.id) {
              const padColor = this.material(color, pin.net);
              if (pad.custom?.length)
                this.appendCustomPad(custom, customEdges, pad, pin, padColor);
              else this.appendPad(pins, pad, pin, padColor);
            }
        }
      if (
        !visibility ||
        BoardDisplay.isVisible(visibility, layer.id, segmentCategory)
      )
        for (const segment of members
          ? (members.segments.get(layer.id) ?? [])
          : scene.segments) {
          if ((++work & 2047) === 0) yield;
          if (segment.layer === layer.id)
            this.appendSegment(
              lines,
              segment,
              this.material(color, segment.net),
            );
        }
      if (!visibility || BoardDisplay.isVisible(visibility, layer.id, "via"))
        for (const via of members
          ? (members.vias.get(layer.id) ?? [])
          : scene.vias) {
          if ((++work & 511) === 0) yield;
          for (const pad of via.pads)
            if (pad.layer === layer.id && !pad.backdrill) {
              const padColor = this.material(color, via.net);
              if (pad.backdrillBase)
                this.appendPad(backdrillBasePads, pad, via, padColor);
              else if (pad.custom?.length)
                this.appendCustomPad(viaCustom, viaEdges, pad, via, padColor);
              else this.appendPad(pads, pad, via, padColor);
            }
        }
      if (backdrillBasePads.length) {
        if (!zoneFills)
          yield* buildSelectionPackets(
            { layer: layer.id, category: "via", backdrillBase: true },
            backdrillBasePads,
          );
        else {
          const batch = {
            layer: layer.id,
            category: "via" as const,
            backdrillBase: true,
            ...(yield* splitPositionSteps(backdrillBasePads, 12, 4)),
          };
          backdrillBasePads.length = 0;
          yield batch;
        }
        backdrillBasePads.length = 0;
      }
      // Preserve submission order, but release each double array before upload
      // and prepare the next category only after the consumer finishes this one.
      const groups: [
        Omit<PrimitiveBatch, "data" | "residual">,
        number[],
        number,
        boolean,
      ][] = [
        [{ layer: layer.id, category: "zone-outline" }, edges, 12, true],
        [{ layer: layer.id, category: segmentCategory }, lines, 12, true],
        [{ layer: layer.id, category: pinCategory }, pins, 12, false],
        [
          {
            layer: layer.id,
            category: pinCategory,
            triangles: true,
            padMode: "filled",
          },
          custom,
          6,
          false,
        ],
        [
          { layer: layer.id, category: pinCategory, padMode: "outline" },
          customEdges,
          12,
          true,
        ],
        [{ layer: layer.id, category: "via" }, pads, 12, false],
        [
          {
            layer: layer.id,
            category: "via",
            triangles: true,
            padMode: "filled",
          },
          viaCustom,
          6,
          false,
        ],
        [
          { layer: layer.id, category: "via", padMode: "outline" },
          viaEdges,
          12,
          true,
        ],
      ];
      for (const [meta, values, stride, curves] of groups) {
        if (!zoneFills) {
          if (reuseOutlines && meta.category === "zone-outline")
            yield {
              ...meta,
              outlineRefs: outlineRanges.map((r) => r.id),
              data: new Float32Array(0),
              residual: new Float32Array(0),
            };
          else yield* buildSelectionPackets(meta, values, stride, curves);
          values.length = 0;
        } else if (curves) {
          const ready = yield* buildArcBatchSteps(meta, values);
          values.length = 0;
          while (ready.length) {
            const batch = ready.shift()!;
            if (meta.category === "zone-outline")
              batch.outlines = outlineRanges
                .map((r) => ({
                  id: r.id,
                  start: batch.arcs ? r.arcStart : r.lineStart,
                  count: batch.arcs ? r.arcCount : r.lineCount,
                }))
                .filter((r) => r.count > 0);
            yield batch;
          }
        } else {
          const batch = {
            ...meta,
            ...(yield* splitPositionSteps(
              values,
              stride,
              stride === 6 ? 2 : 4,
            )),
          };
          values.length = 0;
          yield batch;
        }
      }
      const layerTexts = textByLayer.get(layer.id);
      if (layerTexts) {
        yield* buildBoardTextBatches(
          { ...scene, texts: layerTexts },
          visibility,
        );
        textByLayer.delete(layer.id);
      }
      members?.segments.delete(layer.id);
      members?.zones.delete(layer.id);
      members?.pins.delete(layer.id);
      members?.vias.delete(layer.id);
    }
    const holeGroups = new Map<
      string,
      { data: number[]; viaLayers?: readonly number[] }
    >();
    const backdrills = new Map<
      string,
      { data: number[]; viaLayers: readonly number[] }
    >();
    holeGroups.set("", { data: [] });
    for (const owners of [scene.vias, scene.pins])
      for (const owner of owners) {
        if ((++work & 2047) === 0) yield;
        if ("pads" in owner && owner.backdrill) {
          const viaLayers = new ViaShape(owner).backdrillLayers(),
            key = viaLayers.join(",");
          let group = backdrills.get(key);
          if (!group) {
            group = { data: [], viaLayers };
            backdrills.set(key, group);
          }
          group.data.push(
            owner.at[0] - originX,
            owner.at[1] - originY,
            owner.backdrill.displayDiameter / 2,
            0,
            owner.drill / 2,
            0,
            2,
            1,
            0,
            1,
            0,
            1,
          );
        }
        const viaLayers =
          "pads" in owner
            ? new ViaShape(owner).drillLayers(scene.layers.length)
            : undefined;
        if (
          visibility &&
          (!BoardDisplay.isVisible(visibility, -1, "drill") ||
            !BoardDisplay.isDrillScopeVisible(visibility, viaLayers))
        )
          continue;
        const shape = new DrillShape(owner).pad();
        if (shape) {
          const key =
            viaLayers === undefined ? "" : `via:${viaLayers.join(",")}`;
          let group = holeGroups.get(key);
          if (!group) {
            group = { data: [], viaLayers };
            holeGroups.set(key, group);
          }
          this.appendPad(group.data, shape, owner, [0.46, 0.49, 0.51], true);
        }
      }
    for (const { data, viaLayers } of holeGroups.values()) {
      if (!zoneFills)
        yield* buildSelectionPackets(
          { layer: -1, category: "drill", viaLayers },
          data,
        );
      else {
        const batch = {
          layer: -1,
          category: "drill" as const,
          viaLayers,
          ...(yield* splitPositionSteps(data, 12, 4)),
        };
        data.length = 0;
        yield batch;
      }
      data.length = 0;
    }
    // Native 874 shows the crosshatch over the hole center as well as its annulus.
    // Submit once per cut-layer scope, after ordinary centers, not once per layer.
    for (const { data, viaLayers } of backdrills.values()) {
      if (!zoneFills)
        yield* buildSelectionPackets(
          { layer: -1, category: "drill", viaLayers, backdrill: true },
          data,
        );
      else {
        const batch = {
          layer: -1,
          category: "drill" as const,
          viaLayers,
          backdrill: true,
          ...(yield* splitPositionSteps(data, 12, 4)),
        };
        data.length = 0;
        yield batch;
      }
      data.length = 0;
    }
    // Copper text participates in its copper layer; fabrication/silk text gets
    // separately controllable drawing layers rather than a DOM overlay.
    yield* buildDrawingBatches(scene, visibility);
    for (const texts of textByLayer.values())
      yield* buildBoardTextBatches({ ...scene, texts }, visibility);
    const outline: number[] = [];
    for (const segment of scene.outline)
      this.appendSegment(outline, segment, [0.6, 0.68, 0.73], true);
    const boundary = yield* buildArcBatchSteps(
      { layer: -1, category: "outline" },
      outline,
    );
    outline.length = 0;
    yield* boundary;
  }
}
