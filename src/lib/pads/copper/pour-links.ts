import { cooperative } from "../../cooperative";
import type { readPadsPours } from "../binary/pours";
type Owner = Awaited<ReturnType<typeof readPadsPours>>["owners"][number];
type LinkField = "relationshipId" | "objectHandle" | "parentRelationshipId";
/** The legacy field names retain the reference schema. Their roles vary with
 * owner type: they are linked-list indices, not universal parent/object IDs.
 * Negative -(parent+1) terminates each list; a head equal to parent is empty. */
export class PadsPourLinkReader {
  constructor(private readonly owners: Owner[]) {}
  async read(signal?: AbortSignal) {
    const { owners } = this;
    const pause = cooperative(signal),
      claimed = new Set<number>();
    signal?.throwIfAborted();
    for (let i = 0; i < owners.length; i++)
      if (owners[i].index !== i) throw new Error("PADS 铜区源序号不连续");
    const walk = async (
      parent: number,
      start: number,
      field: LinkField,
      types: number[],
    ) => {
      const result: number[] = [];
      let cursor = start;
      if (cursor === parent) return result;
      while (cursor >= 0) {
        if (result.length % 512 === 0) {
          const pending = pause();
          if (pending) await pending;
        }
        const owner = owners[cursor];
        if (!owner || !types.includes(owner.type) || claimed.has(cursor))
          throw new Error(`PADS 铜区归属链无效 ${parent}/${field}/${cursor}`);
        claimed.add(cursor);
        result.push(cursor);
        cursor = owner[field];
      }
      if (cursor !== -parent - 1)
        throw new Error(`PADS 铜区链尾不匹配 ${parent}/${field}/${cursor}`);
      return result;
    };
    const groups: {
      boundary: number;
      rawNet: number;
      fills: {
        owner: number;
        holes: number[];
        thermals: number[];
      }[];
    }[] = [];
    for (const owner of owners) {
      const pending = pause();
      if (pending) await pending;
      if (owner.type !== 50) continue;
      claimed.add(owner.index);
      const fills = await walk(
        owner.index,
        owner.objectHandle,
        "objectHandle",
        [51],
      );
      const group = {
        boundary: owner.index,
        rawNet: owner.relationshipId,
        fills: [] as {
          owner: number;
          holes: number[];
          thermals: number[];
        }[],
      };
      for (const index of fills)
        group.fills.push({
          owner: index,
          holes: await walk(
            index,
            owners[index].relationshipId,
            "relationshipId",
            [52],
          ),
          thermals: await walk(
            index,
            owners[index].parentRelationshipId,
            "parentRelationshipId",
            [53, 54],
          ),
        });
      groups.push(group);
    }
    if (claimed.size !== owners.length)
      throw new Error(
        `PADS 铜区存在未归属或未知记录 ${owners.length - claimed.size}`,
      );
    return groups;
  }
}
/** Compatibility entry point; parsing state belongs to PadsPourLinkReader. */
export async function readPadsPourLinks(owners: Owner[], signal?: AbortSignal) {
  return new PadsPourLinkReader(owners).read(signal);
}
