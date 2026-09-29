import type {
  Bounds,
  Layer,
  PadShape,
  Pin,
  Point,
  Via,
} from "../../board/model";
import { DrillShape } from "../../board/shapes/drill";
import { PadShape as PadGeometry } from "../../board/shapes/pad";
import type { AllegroBuildProgress } from "../build-progress";
import type { BrdDatabase } from "../database";
import { AllegroGeometryDecoder } from "../decoders/geometry";

/** Geometry helpers and accumulators belong to one build, including retries. */
export class AllegroSceneContext {
  readonly geometry: AllegroGeometryDecoder;
  readonly diagnostics: string[] = [];
  readonly bounds: Bounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  private readonly padBounds: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor(
    readonly database: BrdDatabase,
    readonly scale: number,
    readonly layers: readonly Layer[],
    readonly buildProgress: AllegroBuildProgress,
    readonly signal?: AbortSignal,
  ) {
    this.geometry = new AllegroGeometryDecoder(database, scale);
  }

  readonly point = (x: number, y: number): Point => [
    x * this.scale,
    y * this.scale,
  ];

  readonly include = (point: Point, radius = 0): void => {
    const bounds = this.bounds;
    bounds.minX = Math.min(bounds.minX, point[0] - radius);
    bounds.minY = Math.min(bounds.minY, point[1] - radius);
    bounds.maxX = Math.max(bounds.maxX, point[0] + radius);
    bounds.maxY = Math.max(bounds.maxY, point[1] + radius);
  };

  private includePad(owner: Pin | Via, pad: PadShape): void {
    const bounds = new PadGeometry(pad).bounds(owner, this.padBounds);
    this.include([bounds.minX, bounds.minY]);
    this.include([bounds.maxX, bounds.maxY]);
  }

  readonly includePads = (
    owner: Pin | Via,
    pads: readonly PadShape[],
  ): void => {
    const hole = new DrillShape(owner).pad();
    for (const pad of pads) this.includePad(owner, pad);
    if (hole) this.includePad(owner, hole);
  };
}
