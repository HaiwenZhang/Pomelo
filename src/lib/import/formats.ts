import { importAllegro } from "../allegro/import";
import type { BoardImporter } from "./model";

/** Adapts each source format to the same scene and file metadata contract. */
export const importBoard: BoardImporter = async (
  name,
  buffer,
  signal,
  progress,
  encoding,
) => {
  const report = (phase: string) => progress?.({ phase, fraction: 0.4 });
  if (/\.(?:tgz|tar|tar\.gz)$/i.test(name)) {
    const { importOdb } = await import("../odb/import");
    signal.throwIfAborted();
    const { scene, info } = await importOdb(buffer, signal, report);
    return {
      scene,
      metadata: { format: "odb", odb: info, records: info.features },
    };
  }
  if (/\.def$/i.test(name)) {
    const { importHfss } = await import("../hfss/import");
    signal.throwIfAborted();
    const { scene, info } = await importHfss(buffer, signal, report);
    return {
      scene,
      metadata: {
        format: "hfss",
        hfss: info,
        records: info.sourcePrimitives + info.padstacks,
      },
    };
  }
  if (/\.pcbdoc$/i.test(name)) {
    const { importAltium } = await import("../altium/import");
    signal.throwIfAborted();
    const { scene, info } = await importAltium(buffer, signal, report);
    return {
      scene,
      metadata: { format: "altium", altium: info, records: info.sourceObjects },
    };
  }
  if (/\.kicad_pcb$/i.test(name)) {
    const { importKiCad } = await import("../kicad/import");
    signal.throwIfAborted();
    const { scene, info } = await importKiCad(buffer, signal, report);
    return {
      scene,
      metadata: { format: "kicad", kicad: info, records: info.sourceObjects },
    };
  }
  if (/\.pcb$/i.test(name)) {
    const { importPads } = await import("../pads/import");
    signal.throwIfAborted();
    const { scene, info } = await importPads(buffer, signal, report);
    return {
      scene,
      metadata: {
        format: "pads",
        pads: info,
        records: info.sourcePins + info.sourceVias + info.sourceRoutes,
      },
    };
  }
  return importAllegro(buffer, signal, progress, encoding);
};
