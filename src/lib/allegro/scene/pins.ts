import { lookupString } from "../binary/string-table";
import { isRecordType } from "../binary/record-types";
import { BOND_TOP_LAYER } from "../../board/layers";
import type { PadShape, Pin, Point, SpecialLayer } from "../../board/model";
import { PointShape } from "../../board/shapes/point";
import { parserError } from "../../parser-error";
import type { AllegroSceneContext } from "./context";
import type { AllegroPadstacks } from "./padstacks";

export async function buildPins(
  context: AllegroSceneContext,
  definitions: AllegroPadstacks,
  assignments: ReadonlyMap<number, number>,
) {
  const {
    database: db,
    scale,
    layers,
    diagnostics,
    point,
    includePads,
    buildProgress,
  } = context;
  const { padDecoder, padstacks } = definitions;
  const pins: Pin[] = [];
  const specialLayers: SpecialLayer[] = [];
  buildProgress.begin("构建器件焊盘");
  for (const fp of db.records(0x2d)) {
    const component = db.get(fp.InstRef, 0x07),
      reference =
        component?.RefDes ??
        lookupString(db.strings, component?.RefDesStrPtr) ??
        "";
    const angle = (fp.Rotation * Math.PI) / 180000,
      back = fp.Layer !== 0;
    const visited = new Set<number>();
    let key = fp.FirstPadPtr;
    while (key && key !== fp.Key) {
      if (visited.has(key))
        throw parserError("brdPadChainLoop", { detail: key });
      visited.add(key);
      const placed = db.get(key);
      if (!isRecordType(placed, 0x32)) {
        diagnostics.push(`器件 ${reference} 缺失焊盘 ${key}`);
        break;
      }
      const pad = db.get(placed.PadPtr, 0x0d),
        resolved = pad && padstacks.resolvePin(pad.PadStack, placed.Key),
        stack = resolved?.stack;
      key = placed.NextInFp;
      if (!pad || !stack) {
        diagnostics.push(
          `焊盘 ${placed.Key} 缺失定义或使用未支持的 Padstack 引用 ${pad?.PadStack ?? 0}`,
        );
        continue;
      }
      if (resolved?.die && back) {
        diagnostics.push(`裸片焊盘 ${placed.Key} 的背面放置尚未核验`);
        continue;
      }
      const localAngle = (pad.Rotation * Math.PI) / 180000;
      const offset = new PointShape([
        back ? -pad.CoordsX : pad.CoordsX,
        pad.CoordsY,
      ]).rotate(angle);
      const grid = (value: number) =>
        Math.sign(value) * Math.floor(Math.abs(value) + 0.5);
      const at: Point = [
        (fp.CoordX + grid(offset[0])) * scale,
        (fp.CoordY + grid(offset[1])) * scale,
      ];
      const shapes: PadShape[] = [];
      for (let i = 0; i < stack.LayerCount; i++) {
        const p =
          stack.Components[
            stack.NumFixedCompEntries + stack.NumCompsPerLayer * i + 2
          ];
        if (!p.Type) continue;
        const layer = resolved!.die
          ? BOND_TOP_LAYER
          : (resolved!.embeddedLayer ??
            (back
              ? layers.length - 1 - stack.StartLayer - i
              : stack.StartLayer + i));
        const offsetLocal = new PointShape(point(p.OffsetX, p.OffsetY)).rotate(
          localAngle,
        );
        const offset = new PointShape([
          back ? -offsetLocal[0] : offsetLocal[0],
          offsetLocal[1],
        ]).rotate(angle);
        const value = padDecoder.shape(p, layer, offset, stack.Key);
        if (value) shapes.push(value);
      }
      const assignment = db.get(placed.NetPtr, 0x04);
      const pin: Pin = {
        id: placed.Key,
        net: assignment?.Net ?? assignments.get(placed.Key) ?? 0,
        name: pad.Name ?? lookupString(db.strings, pad.NameStrId) ?? "",
        reference,
        at,
        angle: angle + (back ? Math.PI - localAngle : localAngle),
        back,
        drill: stack.DrillSize * scale,
        drillShape: padDecoder.drill(stack),
        shapes,
      };
      if (resolved?.regionCode !== undefined)
        pin.stackupRegion = {
          sourceReference: pad.PadStack,
          code: resolved.regionCode,
        };
      if (resolved?.die) {
        pin.die = {
          sourceReference: pad.PadStack,
          padstackName: db.strings.get(stack.PadStr) ?? "",
        };
        if (!specialLayers.some((l) => l.id === BOND_TOP_LAYER))
          specialLayers.push({
            id: BOND_TOP_LAYER,
            name: "BOND TOP",
            color: "#d7cd58",
            kind: "die-pad",
            category: "etch",
          });
      }
      pins.push(pin);
      includePads(pin, shapes);
      const pause = buildProgress.checkpoint();
      if (pause) await pause;
    }
  }
  return { pins, specialLayers };
}
