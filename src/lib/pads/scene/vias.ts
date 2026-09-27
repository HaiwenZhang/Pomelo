import type { Via } from "../../board/model";
import type { PadsLayer } from "../binary/metadata";
import type { PadsPadstack } from "../binary/padstack";
import type { PadsFootprint } from "../binary/footprints";
import type { readPadsJunctions } from "../binary/junctions";
import { resolvePadsPadLayers } from "./pad-layers";
import { placePadsPinShape } from "./pins";
import { cooperative } from "../../cooperative";
export function padsViaSpan(
  stack: Pick<PadsPadstack, "drillStart" | "drillEnd">,
  layers: PadsLayer[],
): [number, number] {
  const copper = layers.filter((l) => l.type === 1);
  if (copper.length < 2) throw new Error("PADS Via 缺少至少两个铜层");
  if (stack.drillStart === 0 && stack.drillEnd === 0)
    return [0, copper.length - 1];
  const a = copper.findIndex((l) => l.id === stack.drillStart),
    b = copper.findIndex((l) => l.id === stack.drillEnd);
  if (a < 0 || b < 0 || a === b)
    throw new Error(
      `PADS Via 层跨度无效 ${stack.drillStart}:${stack.drillEnd}`,
    );
  return [Math.min(a, b), Math.max(a, b)];
}
export class PadsViaBuilder {
  constructor(
    private readonly input: {
      version: number;
      layers: PadsLayer[];
      stacks: PadsPadstack[];
      footprints: PadsFootprint[];
      junctions: Awaited<ReturnType<typeof readPadsJunctions>>["vias"];
    },
  ) {}
  async build(signal?: AbortSignal) {
    const { input } = this;
    const pause = cooperative(signal);
    signal?.throwIfAborted();
    const vias: Via[] = [],
      aliases: {
        source: number;
        target: number;
      }[] = [],
      diagnostics: string[] = [],
      seen = new Map<string, number>();
    for (const source of input.junctions) {
      if (vias.length % 256 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      if (
        source.relationshipNet === null ||
        source.relationshipNet !== source.rawNet
      )
        throw new Error(`PADS Via 网络证据不一致 ${source.junction}`);
      const stack = input.stacks[source.padstack];
      if (
        !stack?.active ||
        stack.drill < 0 ||
        (stack.drill > 0 && stack.plated === undefined)
      )
        throw new Error(`PADS Via 孔定义不完整 ${source.junction}`);
      let [startLayer, endLayer] = padsViaSpan(stack, input.layers);
      const id = 0x3c000000 + source.junction;
      // A stack of blind/buried vias can share XY. Merge only identical source
      // definitions and networks, retaining every collapsed source ID as an alias.
      const key = [
        ...source.rawAt,
        source.padstack,
        source.relationshipNet,
        startLayer,
        endLayer,
      ].join(":");
      const previous = seen.get(key);
      if (previous !== undefined) {
        aliases.push({ source: id, target: previous });
        continue;
      }
      seen.set(key, id);
      const resolved = resolvePadsPadLayers(stack, input.layers, input.version);
      for (const d of resolved.unresolved)
        if (d.layer >= startLayer && d.layer <= endLayer)
          diagnostics.push(`PADS Via ${source.junction}: ${d.reason}`);
      const angle = stack.slotLength > 0 ? stack.slotAngle : 0;
      if (stack.slotLength > 0 && stack.slotLength < stack.drill)
        throw new Error(`PADS Via 槽长无效 ${source.junction}`);
      const pads = resolved.geometries
        .filter((g) => g.layer >= startLayer && g.layer <= endLayer)
        .map((g) =>
          placePadsPinShape(g.geometry, { angle: 0, bottom: false }, angle),
        );
      if (stack.drill === 0) {
        if (!pads.length)
          throw new Error(`PADS 无孔接点缺少铜形 ${source.junction}`);
        startLayer = Math.min(...pads.map((p) => p.layer));
        endLayer = Math.max(...pads.map((p) => p.layer));
      }
      vias.push({
        id,
        net: source.relationshipNet + 1,
        at: source.at,
        padstack: stack.index,
        padstackName:
          input.footprints[source.definition]?.name.text ?? undefined,
        drill: stack.drill,
        drillShape:
          stack.drill > 0
            ? {
                width: stack.slotLength || stack.drill,
                height: stack.drill,
                plated: stack.plated!,
              }
            : undefined,
        angle,
        back: false,
        startLayer,
        endLayer,
        pads,
      });
    }
    return { vias, aliases, diagnostics };
  }
}
/** Compatibility entry point; parsing state belongs to PadsViaBuilder. */
export async function buildPadsVias(
  input: {
    version: number;
    layers: PadsLayer[];
    stacks: PadsPadstack[];
    footprints: PadsFootprint[];
    junctions: Awaited<ReturnType<typeof readPadsJunctions>>["vias"];
  },
  signal?: AbortSignal,
) {
  return new PadsViaBuilder(input).build(signal);
}
