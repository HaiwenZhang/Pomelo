import { cooperative } from "../../cooperative";
import type { PadsNet } from "../binary/metadata";
import type { readPadsPours } from "../binary/pours";
import type { readPadsPourLinks } from "./pour-links";
/** Keep source net ordinals here. A later scene adapter must map these to its
 * own IDs. Absence of an independent junction witness is explicitly retained. */
export class PadsPourNetResolver {
  constructor(
    private readonly owners: Awaited<
      ReturnType<typeof readPadsPours>
    >["owners"],
    private readonly groups: Awaited<ReturnType<typeof readPadsPourLinks>>,
    private readonly nets: PadsNet[],
    private readonly junctions: {
      junction: number;
      net: number;
    }[],
  ) {}
  async resolve(signal?: AbortSignal) {
    const { owners, groups, nets, junctions } = this;
    const pause = cooperative(signal);
    signal?.throwIfAborted();
    const known = new Map<number, number>();
    for (const j of junctions) {
      const previous = known.get(j.junction);
      if (previous !== undefined && previous !== j.net)
        throw new Error("PADS 铜区接点网络证据冲突");
      known.set(j.junction, j.net);
    }
    const ownerNets = new Map<number, number | null>(),
      unassigned: number[] = [],
      unwitnessed: {
        owner: number;
        junction: number;
      }[] = [];
    let checked = 0;
    for (const group of groups) {
      const pending = pause();
      if (pending) await pending;
      const raw = group.rawNet,
        net = raw === -1 ? null : raw;
      if (
        net !== null &&
        (!nets[net]?.name.raw.length || nets[net].ordinal !== net)
      )
        throw new Error(`PADS 铜区网络引用无效 ${group.boundary}/${raw}`);
      if (net === null) unassigned.push(group.boundary);
      ownerNets.set(group.boundary, net);
      for (const fill of group.fills) {
        ownerNets.set(fill.owner, net);
        for (const hole of fill.holes) ownerNets.set(hole, net);
        for (const thermal of fill.thermals) {
          const pending = pause();
          if (pending) await pending;
          const junction = owners[thermal].relationshipId,
            witness = known.get(junction);
          if (witness === undefined)
            unwitnessed.push({ owner: thermal, junction });
          else {
            if (witness !== net)
              throw new Error(
                `PADS 铜区与热连接网络冲突 ${thermal}/${net}/${witness}`,
              );
            checked++;
          }
          ownerNets.set(thermal, net);
        }
      }
    }
    return { ownerNets, checked, unassigned, unwitnessed };
  }
}
/** Compatibility entry point; parsing state belongs to PadsPourNetResolver. */
export async function resolvePadsPourNets(
  owners: Awaited<ReturnType<typeof readPadsPours>>["owners"],
  groups: Awaited<ReturnType<typeof readPadsPourLinks>>,
  nets: PadsNet[],
  junctions: {
    junction: number;
    net: number;
  }[],
  signal?: AbortSignal,
) {
  return new PadsPourNetResolver(owners, groups, nets, junctions).resolve(
    signal,
  );
}
