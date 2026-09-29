import type { Layer, Point } from "../../board/model";
import { BoundsAccumulator } from "../../board/bounds";
import type { AllegroBuildProgress } from "../build-progress";
import type { BrdDatabase } from "../database";
import { AllegroGeometryDecoder } from "../decoders/geometry";

/** Geometry helpers and accumulators belong to one build, including retries. */
export class AllegroSceneContext {
  readonly geometry: AllegroGeometryDecoder;
  readonly diagnostics: string[] = [];
  readonly extent = new BoundsAccumulator();
  readonly bounds = this.extent.bounds;

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

  readonly include = this.extent.includePoint;

  readonly includePads = this.extent.includePadOwner;
}
