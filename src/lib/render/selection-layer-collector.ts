import type { BoardScene, Pin, Segment, Via, Zone } from "../board/model";

type LayerGroup<T> = { members: T[]; lastPosition: number };

/** Collects source references for selection without expanding their geometry. */
export class SelectionLayerCollector {
  private static appendOwner<T>(
    groups: Map<number, LayerGroup<T>>,
    layer: number,
    member: T,
    position: number,
  ): void {
    let group = groups.get(layer);
    if (!group) {
      group = { members: [], lastPosition: -1 };
      groups.set(layer, group);
    }
    // An owner can have multiple pads on one layer. Keep its first occurrence.
    if (group.lastPosition !== position) {
      group.members.push(member);
      group.lastPosition = position;
    }
  }

  private static toLayerMembers<T>(
    groups: Map<number, LayerGroup<T>>,
  ): Map<number, T[]> {
    return new Map([...groups].map(([layer, group]) => [layer, group.members]));
  }

  /** Retains source order and yields while traversing large owner collections. */
  static *collectSteps(scene: BoardScene) {
    const segments = new Map<number, LayerGroup<Segment>>();
    const zones = new Map<number, LayerGroup<Zone>>();
    const pins = new Map<number, LayerGroup<Pin>>();
    const vias = new Map<number, LayerGroup<Via>>();
    let work = 0;

    for (const [position, segment] of scene.segments.entries()) {
      SelectionLayerCollector.appendOwner(
        segments,
        segment.layer,
        segment,
        position,
      );
      if ((++work & 511) === 0) yield;
    }
    for (const [position, zone] of scene.zones.entries()) {
      SelectionLayerCollector.appendOwner(zones, zone.layer, zone, position);
      if ((++work & 511) === 0) yield;
    }
    for (const [position, pin] of scene.pins.entries()) {
      for (const pad of pin.shapes) {
        SelectionLayerCollector.appendOwner(pins, pad.layer, pin, position);
        if ((++work & 511) === 0) yield;
      }
      if ((++work & 511) === 0) yield;
    }
    for (const [position, via] of scene.vias.entries()) {
      for (const pad of via.pads) {
        SelectionLayerCollector.appendOwner(vias, pad.layer, via, position);
        if ((++work & 511) === 0) yield;
      }
      if ((++work & 511) === 0) yield;
    }
    return {
      segments: SelectionLayerCollector.toLayerMembers(segments),
      zones: SelectionLayerCollector.toLayerMembers(zones),
      pins: SelectionLayerCollector.toLayerMembers(pins),
      vias: SelectionLayerCollector.toLayerMembers(vias),
    };
  }
}
