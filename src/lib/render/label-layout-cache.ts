import {
  BoardLabelLayout,
  type BoardLabelLayoutInput,
} from "./board-label-layout";

/** Hover and selection change composition, not label placement. Snapshot mutable
 * camera/visibility values; scene, font and indexes are immutable identities. */
export class LabelLayoutCache {
  private previous?: { key: string; identities: unknown[] };

  clear() {
    this.previous = undefined;
  }

  update(
    input: BoardLabelLayoutInput,
    upload: (batches: Map<string, number[]>) => void,
  ): boolean {
    const { camera, options } = input;
    const key = JSON.stringify([
      camera.x,
      camera.y,
      camera.scale,
      camera.horizontalSign,
      input.width,
      input.height,
      {
        trackNames: options.trackNames,
        pinNames: options.pinNames,
        viaNames: options.viaNames,
        thruLabels: options.thruLabels,
        bbLabels: options.bbLabels,
        zoneNames: options.zoneNames,
        shapes: options.shapes,
        vias: options.vias,
        pins: options.pins,
        hidden: [...(options.hidden ?? [])],
        layerVisibility: [...(options.layerVisibility ?? [])],
      },
    ]);
    const identities = [
      input.scene,
      input.font,
      input.viaIndex,
      input.trackIndex,
      input.areaIndex,
    ];
    if (
      this.previous?.key === key &&
      identities.every((value, i) => value === this.previous!.identities[i])
    )
      return false;
    // Publish the cache key only after layout/upload succeeds.
    upload(BoardLabelLayout.layout(input));
    this.previous = { key, identities };
    return true;
  }
}
