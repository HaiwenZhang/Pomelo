import type { BoardScene, PadShape, Pin, Point, Via } from "../../board/model";
import { BoundsAccumulator } from "../../board/bounds";
import { PadShape as BoardPadShape } from "../../board/shapes/pad";
import { PathShape } from "../../board/shapes/path";
import { ShapeTransform } from "../../board/shapes/transform";
import type { Subnet } from "../connectivity";

/** Assemble apertures by electrical owner and re-anchor to saved drill geometry. */
export class OdbPadBuilder {
  private readonly owners = new Map<number, Pin | Via>();
  constructor(
    private readonly scene: BoardScene,
    private readonly extent: BoundsAccumulator,
    private readonly copperCount: number,
    private readonly nextId: () => number,
  ) {}
  owner = (
    subnet: Subnet | undefined,
    at: Point,
    angle: number,
    mirror: boolean,
  ): Pin | Via => {
    const existing = subnet && this.owners.get(subnet.id);
    if (existing) return existing;
    const net = subnet?.net ?? 0,
      id = this.nextId();
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
        endLayer: this.copperCount - 1,
        pads: [],
      };
      this.scene.vias.push(result);
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
      this.scene.pins.push(result);
    }
    if (subnet && (subnet.kind === "VIA" || subnet.kind === "TOP"))
      this.owners.set(subnet.id, result);
    return result;
  };
  attachPad = (
    target: Pin | Via,
    pad: PadShape,
    at: Point,
    angle: number,
    mirror: boolean,
    layer: number,
  ) => {
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
    this.extent.includePad(target, shape);
  };
  setDrill = (
    target: Pin | Via,
    at: Point,
    angle: number,
    mirror: boolean,
    width: number,
    height: number,
    plated: boolean,
  ) => {
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
      this.attachPad(
        target,
        { ...pad, offset: [0, 0] },
        [oldAt[0] + pad.offset[0], oldAt[1] + pad.offset[1]],
        oldAngle,
        oldBack,
        pad.layer,
      );
    target.drill = width;
    target.drillShape = { width, height, plated };
  };
}
