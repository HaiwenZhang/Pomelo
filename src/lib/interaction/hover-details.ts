import type { BoardScene, Segment } from "../board/model";

import { BoardLayers } from "../board/layers";
import { ZoneShape } from "../board/shapes/zone";

import type {
  BoardIndex,
  BoardObject,
  PickHit,
  SelectionMode,
} from "./picking";

import { cooperative } from "../cooperative";

const mm = (n: number) => `${n.toFixed(4)} mm`;
const length = (s: Segment) =>
  s.arc
    ? Math.abs(s.arc.sweep) * s.arc.radius
    : Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
// Arrays belong to the immutable index; a closed board releases this cache.
const lengths = new WeakMap<BoardObject[], { routed: number; bond: number }>();
export async function hoverDetails(
  scene: BoardScene,
  index: BoardIndex,
  hit: PickHit,
  mode: SelectionMode,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  const object = hit.object,
    value = object.value,
    net = scene.nets.get(value.net) || "(unassigned)";
  const layer = (id: number) => new BoardLayers(scene).name(id);
  if (object.kind === "drawing")
    return [
      `Dimension - ${layer(object.value.layer)}`,
      ...(object.value.texts.length
        ? [`Text: ${object.value.texts.map((t) => t.text).join(" / ")}`]
        : []),
      `Source ${object.value.ownerId === undefined ? "graphic" : "symbol"}: ${object.value.id}`,
      `Strokes: ${object.value.segments.length}`,
    ];
  if (
    (mode === "net" && value.net) ||
    (mode === "track" &&
      (object.kind === "segment" || object.kind === "bond-wire"))
  ) {
    const objects = index.select(hit, mode).objects;
    let total = lengths.get(objects);
    if (total === undefined) {
      total = { routed: 0, bond: 0 };
      const checkpoint = cooperative(signal, 6, 16);
      for (let i = 0; i < objects.length; i++) {
        const member = objects[i];
        if (member.kind === "segment") total.routed += length(member.value);
        else if (member.kind === "bond-wire")
          total.bond += length(member.value);
        if ((i & 255) === 0) {
          const pause = checkpoint();
          if (pause) await pause;
        }
      }
      signal.throwIfAborted();
      lengths.set(objects, total);
    }
    return [
      `${mode === "net" ? "Net" : object.kind === "bond-wire" ? "Bond wire" : "Cline"}: ${net}`,
      `Routed length: ${mm(total.routed)}`,
      ...(total.bond ? [`Bond wire 2D length: ${mm(total.bond)}`] : []),
      `Objects: ${objects.length}`,
    ];
  }
  if (object.kind === "segment")
    return [
      `${object.value.arc ? "Arc" : "Line"} segment - Width: ${mm(object.value.width)}`,
      `Etch / ${layer(object.value.layer)} - Net: ${net}`,
      `Length: ${mm(length(object.value))}`,
    ];
  if (object.kind === "bond-wire")
    return [
      `Bond wire: ${object.value.bondWire?.reference}.${object.value.bondWire?.pinName}`,
      `Profile: ${object.value.bondWire?.profile} - Net: ${net}`,
      `Material: ${object.value.bondWire?.material ?? "(unspecified)"}`,
      `Width: ${mm(object.value.width)}`,
      `2D length: ${mm(length(object.value))}`,
    ];
  if (object.kind === "finger")
    return [
      `Bond finger: ${object.value.finger?.reference}.${object.value.finger?.name}`,
      `Padstack: ${object.value.padstackName || `#${object.value.padstack}`}`,
      `${layer(object.value.startLayer)} - Net: ${net}`,
      `XY: ${mm(object.value.at[0])}, ${mm(object.value.at[1])}`,
      `Rotation: ${(((object.value.angle ?? 0) * 180) / Math.PI).toFixed(3)} deg`,
    ];
  if (object.kind === "via")
    return [
      `Via - Padstack: ${object.value.padstackName || `#${object.value.padstack}`}`,
      `Net: ${net}`,
      `XY: ${mm(object.value.at[0])}, ${mm(object.value.at[1])}`,
      `${layer(object.value.startLayer)} : ${layer(object.value.endLayer)} - Drill: ${mm(object.value.drill)}`,
      ...(object.value.backdrill?.spans.map(
        (span) =>
          `Backdrill: ${layer(span.startLayer)} -> ${layer(span.stopLayer)}; protect ${layer(span.protectedLayer)}`,
      ) ?? []),
    ];
  if (object.kind === "pin")
    return [
      `${object.value.die ? "Die pad" : "Pin"}: ${object.value.reference}.${object.value.name}`,
      ...(object.value.die
        ? [
            `Layer: ${layer(hit.layer)}`,
            `Padstack: ${object.value.die.padstackName}`,
          ]
        : []),
      `Net: ${net}`,
      `XY: ${mm(object.value.at[0])}, ${mm(object.value.at[1])}`,
    ];
  return [
    `Shape - ${layer(object.value.layer)}`,
    `Net: ${net}`,
    `Voids: ${Math.max(0, new ZoneShape(object.value).ringCount() - 1)}`,
  ];
}
