import { PadsLayerMap } from "./layer-map";
import type { PadShape, Pin } from "../../board/model";
import { PathShape } from "../../board/shapes/path";
import { cooperative } from "../../cooperative";
import { ShapeTransform } from "../../board/shapes/transform";
import type { PadsFootprint } from "../binary/footprints";
import type { PadsLayer, PadsPlacement } from "../binary/metadata";
import { resolvePadsPadLayers } from "./pad-layers";
import type { PadsPadstack } from "../binary/padstack";
import type { readPadsPinJunctions } from "../binary/pin-junctions";
import { padsPlacePoint } from "./placement";
/** BoardScene stores pad offsets in world axes. Shapes remain in owner-local
 * axes; centered basic PADS shapes are reflection symmetric, so bottom-side
 * reflection changes the sign of their angle without needing a mirrored mesh. */
export function placePadsPinShape(
  geometry: ReturnType<
    typeof resolvePadsPadLayers
  >["geometries"][number]["geometry"],
  part: Pick<PadsPlacement, "angle" | "bottom">,
  ownerAngle = (part.bottom ? -1 : 1) * part.angle,
): PadShape {
  const offset = padsPlacePoint(geometry.localOffset, {
    at: [0, 0],
    angle: part.angle + geometry.rotation,
    bottom: part.bottom,
  });
  const angle =
      (part.bottom ? -1 : 1) * (part.angle + geometry.rotation) - ownerAngle,
    quarter = Math.round(angle / (Math.PI / 2));
  if (Math.abs(angle - (quarter * Math.PI) / 2) < 1e-10) {
    const swap = Math.abs(quarter) % 2 === 1;
    return {
      ...geometry.shape,
      width: swap ? geometry.shape.height : geometry.shape.width,
      height: swap ? geometry.shape.width : geometry.shape.height,
      offset,
    };
  }
  // Custom pads are reflected by the shared engine when owner.back is set.
  // Store the inverse reflection here so it is applied exactly once overall.
  const rotation = new ShapeTransform([0, 0], angle, false),
    reflection = new ShapeTransform([0, 0], 0, part.bottom);
  const paths = geometry.paths.map((path) =>
    path.map((s) => reflection.segment(rotation.segment(s))),
  );
  return {
    ...geometry.shape,
    type: 22,
    offset,
    customPaths: paths,
    custom: paths.map((p) => new PathShape(p).flatten()),
  };
}
export class PadsPinBuilder {
  constructor(
    private readonly input: {
      version: number;
      layers: PadsLayer[];
      layerMap?: PadsLayerMap;
      placements: PadsPlacement[];
      stacks: PadsPadstack[];
      footprints: PadsFootprint[];
      instances: {
        placement: number;
        footprint: number;
      }[];
      junctions: Awaited<ReturnType<typeof readPadsPinJunctions>>["pins"];
      assignments: {
        placement: number;
        terminal: number;
        net: number;
      }[];
    },
  ) {}
  async build(signal?: AbortSignal) {
    const { input } = this;
    const layerMap = input.layerMap ?? new PadsLayerMap(input.layers);
    const pause = cooperative(signal);
    signal?.throwIfAborted();
    const instances = new Map(
      input.instances.map((i) => [i.placement, input.footprints[i.footprint]]),
    );
    const nets = new Map(
      input.assignments.map((a) => [`${a.placement}:${a.terminal}`, a.net + 1]),
    );
    const pins: Pin[] = [],
      diagnostics: string[] = [],
      holes: {
        id: number;
        padstack: number;
        drill: number;
        slotLength: number;
        slotAngle: number;
        plating: boolean | "unresolved";
      }[] = [];
    const seen = new Set<string>();
    let fallbackNames = 0;
    for (const source of input.junctions) {
      if (pins.length % 256 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const key = `${source.placement}:${source.terminal}`;
      if (seen.has(key)) throw new Error(`PADS 重复引脚 ${key}`);
      seen.add(key);
      const part = input.placements[source.placement],
        terminal = instances.get(source.placement)?.terminals[
          source.terminal - 1
        ];
      if (!part || !terminal) throw new Error(`PADS 引脚源引用缺失 ${key}`);
      const stack = input.stacks[terminal.padstack],
        at = padsPlacePoint(terminal.at, part);
      if (Math.hypot(at[0] - source.at[0], at[1] - source.at[1]) > 1e-5)
        throw new Error(`PADS 引脚放置不一致 ${key}`);
      const resolved = resolvePadsPadLayers(
        stack,
        input.layers,
        input.version,
        part.bottom,
        layerMap,
      );
      for (const d of resolved.unresolved)
        diagnostics.push(`PADS ${key} 层 ${d.layer}: ${d.reason}`);
      const id = 0x3c000000 + source.junction;
      if (stack.drill > 0)
        holes.push({
          id,
          padstack: stack.index,
          drill: stack.drill,
          slotLength: stack.slotLength,
          slotAngle: stack.slotAngle,
          plating: stack.plated ?? "unresolved",
        });
      const slot = stack.slotLength > 0,
        hasHoleShape = stack.drill > 0 && stack.plated !== undefined;
      if (
        slot &&
        (!Number.isFinite(stack.slotAngle) || stack.slotLength < stack.drill)
      )
        throw new Error(`PADS 槽孔尺寸/角度无效 ${key}`);
      if (slot && !hasHoleShape)
        diagnostics.push(`PADS ${key} 槽孔电镀属性待核验`);
      const angle =
        (part.bottom ? -1 : 1) * (part.angle + (slot ? stack.slotAngle : 0));
      if (!terminal.name.text) fallbackNames++;
      pins.push({
        id,
        net: nets.get(key) ?? 0,
        reference: part.reference.text ?? "",
        name: terminal.name.text || String(terminal.ordinal),
        at,
        angle,
        back: part.bottom,
        drill: slot && !hasHoleShape ? 0 : stack.drill,
        drillShape: hasHoleShape
          ? {
              width: slot ? stack.slotLength : stack.drill,
              height: stack.drill,
              plated: stack.plated!,
            }
          : undefined,
        shapes: resolved.geometries.map((g) =>
          placePadsPinShape(g.geometry, part, angle),
        ),
      });
    }
    const expected = input.instances.reduce(
      (n, i) => n + input.footprints[i.footprint].terminals.length,
      0,
    );
    if (expected !== pins.length) throw new Error("PADS 场景引脚覆盖不完整");
    return { pins, holes, diagnostics, fallbackNames };
  }
}
/** Compatibility entry point; parsing state belongs to PadsPinBuilder. */
export async function buildPadsPins(
  input: {
    version: number;
    layers: PadsLayer[];
    placements: PadsPlacement[];
    stacks: PadsPadstack[];
    footprints: PadsFootprint[];
    instances: {
      placement: number;
      footprint: number;
    }[];
    junctions: Awaited<ReturnType<typeof readPadsPinJunctions>>["pins"];
    assignments: {
      placement: number;
      terminal: number;
      net: number;
    }[];
  },
  signal?: AbortSignal,
) {
  return new PadsPinBuilder(input).build(signal);
}
