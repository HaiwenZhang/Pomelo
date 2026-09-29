import type { BoardScene, SceneBuildEvent } from "../board/model";
import { AllegroBuildProgress } from "./build-progress";
import type { BrdDatabase } from "./database";
import { readNetAssignments } from "./scene/connectivity";
import { AllegroSceneContext } from "./scene/context";
import { buildCopper } from "./scene/copper";
import { buildGraphics } from "./scene/graphics";
import { readLayersAndNets } from "./scene/metadata";
import { readPadstacks } from "./scene/padstacks";
import { buildPins } from "./scene/pins";
import { buildRoutes } from "./scene/routes";
import { buildVias } from "./scene/vias";
import { allegroUnitScale } from "./units";

/** Coordinates build stages; each invocation owns its geometry and caches. */
export class AllegroSceneBuilder {
  constructor(readonly database: BrdDatabase) {}

  async build(
    signal?: AbortSignal,
    progress?: (label: string) => void,
    trace?: (event: SceneBuildEvent) => void,
  ): Promise<BoardScene> {
    const db = this.database;
    const buildProgress = new AllegroBuildProgress(signal, progress, trace);
    buildProgress.begin("构建层与网络");
    const scale = allegroUnitScale(db.header.units, db.header.divisor);
    const { layers, nets } = await readLayersAndNets(db, buildProgress);
    const assignments = await readNetAssignments(db, buildProgress);
    const context = new AllegroSceneContext(
      db,
      scale,
      layers,
      buildProgress,
      signal,
    );
    const routes = await buildRoutes(context, assignments);
    const padstacks = await readPadstacks(context);
    const vias = await buildVias(
      context,
      padstacks,
      assignments,
      routes.bondPins,
    );
    const { pins, specialLayers: pinLayers } = await buildPins(
      context,
      padstacks,
      assignments,
    );
    const { zones, outline } = await buildCopper(
      context,
      assignments,
      routes.segments,
      trace,
    );
    const graphics = await buildGraphics(context, outline);
    const specialLayers = [...routes.specialLayers, ...pinLayers];
    buildProgress.finish();
    return {
      layers,
      ...(specialLayers.length ? { specialLayers } : {}),
      nets,
      segments: routes.segments,
      vias,
      pins,
      zones,
      outline,
      ...graphics,
      bounds: context.bounds,
      diagnostics: context.diagnostics,
    };
  }
}
