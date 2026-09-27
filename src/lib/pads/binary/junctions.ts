import type { PadsContainer } from "./container";
import { PADS_BASIC_TO_MM, type PadsNet } from "./metadata";
import type { PadsFootprint } from "./footprints";
import { cooperative } from "../../cooperative";
/** Keep source junctions separate, including co-located Via carriers. Scene
 * deduplication must resolve their definition and network evidence first. */
export class PadsJunctionReader {
  constructor(
    private readonly container: PadsContainer,
    private readonly nets: PadsNet[],
    private readonly footprints: PadsFootprint[],
  ) {}
  async read(signal?: AbortSignal) {
    const { container, nets, footprints } = this;
    const { view, sections } = container,
      pause = cooperative(signal);
    signal?.throwIfAborted();
    const range = (at: number, n: number) => {
      if (at < 0 || n < 0 || at > view.byteLength - n)
        throw new Error(`PADS 接点字段越界 ${at}+${n}`);
    };
    const u32 = (at: number) => {
      range(at, 4);
      return view.getUint32(at, true);
    };
    const s = sections[49],
      end = s.offset + s.bytes;
    range(s.offset, s.bytes);
    let cursor = s.offset,
      sourceNet = 0;
    const read = () => {
      if (cursor > end - 4) throw new Error("PADS 接点关系截断");
      const n = u32(cursor);
      cursor += 4;
      return n;
    };
    const links: {
        junction: number;
        sourceNet: number;
      }[] = [],
      relationships: {
        sourceNet: number;
        direction: number;
        object: number;
        members: number[];
      }[] = [];
    while (cursor < end) {
      const pending = pause();
      if (pending) await pending;
      if (sourceNet >= nets.length)
        throw new Error("PADS 接点关系网络数量无效");
      for (let direction = 0; direction < 2; direction++) {
        const count = read();
        if (count > (end - cursor) / 8)
          throw new Error("PADS 接点关系数量越界");
        for (let i = 0; i < count; i++) {
          const object = read(),
            values = read(),
            tag = direction ? 0x18000000 : 0x3c000000,
            index = object & 0xffffff;
          if (
            (object & 0xff000000) >>> 0 !== tag ||
            index >= sections[direction ? 24 : 60].count ||
            values > (end - cursor) / 4
          )
            throw new Error("PADS 接点关系引用无效");
          const members: number[] = [];
          for (let j = 0; j < values; j++) {
            const member = read();
            if (
              (member & 0xff000000) >>> 0 !==
                (direction ? 0x3c000000 : 0x18000000) ||
              (member & 0xffffff) >= sections[direction ? 60 : 24].count
            )
              throw new Error("PADS 接点关系成员越界");
            members.push(member);
          }
          relationships.push({ sourceNet, direction, object, members });
          if (!direction) links.push({ junction: index, sourceNet });
        }
      }
      sourceNet++;
    }
    const named: PadsNet[] = [],
      seen = new Set<string>();
    for (const net of nets) {
      const key = Array.from(net.name.raw).join(",");
      if (
        !net.name.raw.length ||
        net.name.text === "___Unassigned_Obstacles_" ||
        seen.has(key)
      )
        continue;
      seen.add(key);
      named.push(net);
    }
    if (sourceNet !== nets.length && sourceNet !== named.length)
      throw new Error(
        `PADS 接点关系网络数不符 ${sourceNet}/${nets.length}/${named.length}`,
      );
    const owners = new Map<number, number>();
    for (const link of links) {
      const net = (sourceNet === nets.length ? nets : named)[link.sourceNet]
          .ordinal,
        previous = owners.get(link.junction);
      if (previous !== undefined && previous !== net)
        throw new Error("PADS 接点网络关系冲突");
      owners.set(link.junction, net);
    }
    const js = sections[60],
      stride = js.count ? js.declaredBytes / js.count : 64;
    if (!Number.isInteger(stride) || stride < 31)
      throw new Error("PADS 接点记录尺寸无效");
    const vias: {
        junction: number;
        sourceOffset: number;
        rawAt: [number, number];
        at: [number, number];
        definition: number;
        padstack: number;
        rawNet: number;
        relationshipNet: number | null;
        headBytes: number[];
      }[] = [],
      handles: {
        junction: number;
        handle: number;
        net: number;
      }[] = [],
      unresolved: {
        junction: number;
        definition: number;
      }[] = [];
    for (let junction = 0; junction < js.count; junction++) {
      if (junction % 512 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const base = js.offset + junction * stride,
        type = base + (container.version === 0x2011 ? 19 : 27);
      range(base, 34);
      const net = owners.get(junction),
        handle = u32(base + 8);
      if (net !== undefined && handle) handles.push({ junction, handle, net });
      if (
        view.getUint8(type) !== 14 ||
        view.getUint8(type + 4) !== 23 ||
        (view.getUint8(type + 5) & 2) === 0
      )
        continue;
      const definition = view.getUint8(type - 3),
        fp = footprints[definition],
        padstack = fp?.terminals[0]?.padstack;
      if (padstack === undefined) {
        unresolved.push({ junction, definition });
        continue;
      }
      const rawAt: [number, number] = [
        view.getInt32(base, true),
        view.getInt32(base + 4, true),
      ];
      vias.push({
        junction,
        sourceOffset: type,
        rawAt,
        at: [rawAt[0] * PADS_BASIC_TO_MM, rawAt[1] * PADS_BASIC_TO_MM],
        definition,
        padstack,
        rawNet: view.getUint16(type + 1, true),
        relationshipNet: net ?? null,
        headBytes: [view.getUint8(type + 5), view.getUint8(type + 6)],
      });
    }
    return { relationships, handles, vias, unresolved, sourceNets: sourceNet };
  }
}
/** Compatibility entry point; parsing state belongs to PadsJunctionReader. */
export async function readPadsJunctions(
  container: PadsContainer,
  nets: PadsNet[],
  footprints: PadsFootprint[],
  signal?: AbortSignal,
) {
  return new PadsJunctionReader(container, nets, footprints).read(signal);
}
