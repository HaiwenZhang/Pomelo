import { CopperMesh } from "../../board/copper-mesh";
import type { PadsCopperFill } from "./copper";
import { PadsCopperRegionBuilder } from "./copper-regions";

export type PadsCopperMesh = Awaited<ReturnType<CopperMesh["build"]>>;
export interface PadsCopperJob {
  index: number;
  fill: PadsCopperFill;
}
export type PadsCopperReply =
  | { type: "complete"; index: number; meshes: PadsCopperMesh[] }
  | { type: "error"; index: number; error: { name: string; message: string } };

/** One independent saved fill, shared by the serial and worker execution paths. */
export class PadsCopperMeshBuilder {
  constructor(private readonly fill: PadsCopperFill) {}

  async build(signal?: AbortSignal): Promise<PadsCopperMesh[]> {
    const regions = new PadsCopperRegionBuilder(this.fill).build(signal);
    if (!regions.length)
      throw new Error(`PADS 铜区 ${this.fill.owner} 没有可绘制几何`);
    const meshes: PadsCopperMesh[] = [];
    for (const region of regions)
      meshes.push(
        await new CopperMesh([region.outer, ...region.holes]).build(signal),
      );
    return meshes;
  }

  /** Transfer the mesh storage once; indices can be a subarray of a larger buffer. */
  static transfers(meshes: PadsCopperMesh[]): ArrayBuffer[] {
    return meshes.flatMap((mesh) => [
      mesh.points.buffer,
      mesh.indices.buffer,
      mesh.ringOffsets.buffer,
      mesh.ringBounds.buffer,
      mesh.ringOrder.buffer,
    ]);
  }
}
