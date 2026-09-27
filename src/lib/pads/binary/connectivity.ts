import type { PadsContainer } from "./container";
import type { PadsNet } from "./metadata";
import type { PadsFootprint } from "./footprints";
import { cooperative } from "../../cooperative";
export class PadsConnectivityReader {
  constructor(
    private readonly container: PadsContainer,
    private readonly nets: PadsNet[],
    private readonly footprints: PadsFootprint[],
    private readonly instances: {
      placement: number;
      footprint: number;
    }[],
  ) {}
  async read(signal?: AbortSignal) {
    const { container, nets, footprints, instances } = this;
    const { view, sections, version } = container,
      s = sections[24],
      old = version <= 0x2022,
      legacy = version === 0x2011,
      stride = legacy ? 48 : 68,
      pause = cooperative(signal);
    signal?.throwIfAborted();
    const u = (at: number) => {
      if (at < 0 || at > view.byteLength - 4)
        throw new Error(`PADS 连接字段越界 ${at}`);
      return view.getUint32(at, true);
    };
    const half = (at: number) => u(at) & 65535;
    if (s.declaredBytes !== s.count * stride)
      throw new Error("PADS 连接记录尺寸无效");
    const pins: {
        placement: number;
        terminal: number;
      }[] = [],
      ids = new Map<string, number>(),
      parents: number[] = [],
      edges: number[] = [];
    const intern = (placement: number, terminal: number) => {
      const key = `${placement}:${terminal}`,
        found = ids.get(key);
      if (found !== undefined) return found;
      const id = pins.length;
      pins.push({ placement, terminal });
      parents.push(id);
      ids.set(key, id);
      return id;
    };
    const root = (id: number) => {
      while (parents[id] !== id) {
        parents[id] = parents[parents[id]];
        id = parents[id];
      }
      return id;
    };
    const join = (a: number, b: number) => {
      const x = root(a),
        y = root(b);
      if (x !== y) parents[x] = y;
      edges.push(a);
    };
    const base = s.offset + (old ? 16 : -36);
    for (let i = 0; i < s.count; i++) {
      if (i % 512 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const at = base + i * stride;
      if (legacy) {
        if (half(at) !== 65534 || half(at + 20) !== 0xfe00)
          throw new Error(`PADS 紧凑连接标记无效 ${i}`);
        join(
          intern(half(at + 4), half(at + 8)),
          intern(half(at + 6), half(at + 10)),
        );
      } else if (old) {
        if (
          (u(at) & 65535) !== 65534 ||
          (u(at + 36) & 0xffffffc0) >>> 0 !== 0xfe000000
        )
          throw new Error(`PADS 旧版连接标记无效 ${i}`);
        join(intern(u(at + 8), u(at + 16)), intern(u(at + 12), u(at + 20)));
      } else {
        if (
          (u(at + 52) & 65535) !== 65534 ||
          (u(at + 88) & 0xffffffc0) >>> 0 !== 0xfe000000
        )
          throw new Error(`PADS 连接标记无效 ${i}`);
        join(intern(u(at + 60), u(at + 68)), intern(u(at + 64), u(at + 72)));
      }
    }
    const owners = new Map<number, number>(),
      aliases: {
        root: number;
        kept: number;
        alias: number;
      }[] = [],
      componentEdges = new Map<number, number>();
    for (const id of edges) {
      const r = root(id);
      componentEdges.set(r, (componentEdges.get(r) ?? 0) + 1);
    }
    const valid = (n: PadsNet) =>
      n.name.raw.length > 0 && n.name.text !== "___Unassigned_Obstacles_";
    const claim = (id: number, net: PadsNet) => {
      const r = root(id),
        existing = owners.get(r);
      if (existing === undefined) {
        owners.set(r, net.ordinal);
        return;
      }
      if (existing === net.ordinal) return;
      const other = nets[existing];
      const same =
        other.name.raw.length === net.name.raw.length &&
        other.name.raw.every((v, i) => v === net.name.raw[i]);
      const a = other.name.text?.startsWith("$$$"),
        b = net.name.text?.startsWith("$$$");
      if (!same && !a && !b)
        throw new Error(`PADS 网络归属冲突 ${existing}/${net.ordinal}`);
      const kept = a && !b ? net.ordinal : existing;
      owners.set(r, kept);
      aliases.push({
        root: r,
        kept,
        alias: kept === existing ? net.ordinal : existing,
      });
    };
    for (const net of nets) {
      if (!valid(net)) continue;
      if (old) {
        const at =
            sections[23].offset +
            (legacy ? 12 : 20) +
            net.ordinal * (legacy ? 124 : 144),
          count = u(at + 92),
          edge = legacy ? half(at + 10) : u(at + 8),
          object = legacy ? half(at + 6) : u(at),
          terminal = legacy ? half(at + 8) : u(at + 4);
        if (!count) continue;
        const id = ids.get(`${object}:${terminal}`);
        if (
          edge >= edges.length ||
          id === undefined ||
          root(id) !== root(edges[edge]) ||
          componentEdges.get(root(id)) !== count
        )
          throw new Error(`PADS 旧版网络连接锚点无效 ${net.ordinal}`);
        claim(id, net);
      } else if (net.anchors[1]) claim(intern(...net.anchors), net);
    }
    const placed = new Map(
        instances.map((i) => [i.placement, footprints[i.footprint]]),
      ),
      assignments: {
        placement: number;
        terminal: number;
        net: number;
      }[] = [],
      unresolved: {
        placement: number;
        terminal: number;
        net: number;
        reason: string;
      }[] = [];
    let unowned = 0;
    for (let id = 0; id < pins.length; id++) {
      const net = owners.get(root(id)),
        pin = pins[id];
      if (net === undefined) {
        unowned++;
        continue;
      }
      const fp = placed.get(pin.placement);
      if (!fp || pin.terminal < 1 || pin.terminal > fp.terminals.length)
        unresolved.push({
          ...pin,
          net,
          reason: "缺少已放置器件或端子序号越界",
        });
      else assignments.push({ ...pin, net });
    }
    return { edges: s.count, assignments, aliases, unresolved, unowned };
  }
}
/** Compatibility entry point; parsing state belongs to PadsConnectivityReader. */
export async function readPadsConnectivity(
  container: PadsContainer,
  nets: PadsNet[],
  footprints: PadsFootprint[],
  instances: {
    placement: number;
    footprint: number;
  }[],
  signal?: AbortSignal,
) {
  return new PadsConnectivityReader(
    container,
    nets,
    footprints,
    instances,
  ).read(signal);
}
