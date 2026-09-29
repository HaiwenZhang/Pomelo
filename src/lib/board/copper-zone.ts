import { CopperMesh } from "./copper-mesh";
import type { Point, Segment, Zone } from "./model";
import { PathShape } from "./shapes/path";
import { completeStepsAsync } from "../iteration";

export type CopperMeshData = Awaited<ReturnType<CopperMesh["build"]>>;
type ZoneIdentity = Pick<Zone, "id" | "layer" | "net">;
type CopperContours = ZoneIdentity & {
  paths?: Segment[][];
  rings?: Point[][];
  boundaryBreaks?: Uint32Array;
};

export async function flattenCopperPaths(
  paths: Segment[][],
  signal?: AbortSignal,
): Promise<Point[][]> {
  const rings: Point[][] = [];
  for (const path of paths)
    rings.push(
      await completeStepsAsync(new PathShape(path).flattenSteps(), signal),
    );
  return rings;
}

/** Attach source identity to a mesh from either the local or worker build path.
 * Rings are already packed in mesh.points; do not retain a second point array. */
export function copperZoneFromMesh(
  identity: ZoneIdentity,
  mesh: CopperMeshData,
  paths: Segment[][] = [],
  boundaryBreaks?: Uint32Array,
): Zone {
  return {
    id: identity.id,
    layer: identity.layer,
    net: identity.net,
    paths,
    rings: [],
    ...mesh,
    ...(boundaryBreaks?.length ? { boundaryBreaks } : {}),
  };
}

/** Source-specific topology (islands, bridges, offsets, thermals) is resolved
 * before this step. Analytic paths remain available to outlines and picking. */
export async function createCopperZone(
  source: CopperContours,
  signal?: AbortSignal,
): Promise<Zone> {
  signal?.throwIfAborted();
  const paths = source.paths ?? [];
  const rings = source.rings ?? (await flattenCopperPaths(paths, signal));
  const mesh = await new CopperMesh(rings).build(signal, paths);
  return copperZoneFromMesh(source, mesh, paths, source.boundaryBreaks);
}
