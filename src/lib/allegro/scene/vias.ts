import { lookupString } from "../binary/string-table";
import type { PadShape, Via } from "../../board/model";
import { BackdrillShape } from "../../board/shapes/backdrill";
import { PointShape } from "../../board/shapes/point";
import { AllegroBondFingerDecoder } from "../decoders/bond-finger";
import type { AllegroSceneContext } from "./context";
import type { AllegroPadstacks } from "./padstacks";

export async function buildVias(
  context: AllegroSceneContext,
  definitions: AllegroPadstacks,
  assignments: ReadonlyMap<number, number>,
  bondPins: ReadonlyMap<number, number | undefined>,
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
  const { stacks, padDecoder, padstacks } = definitions;
  const bondFingers = new AllegroBondFingerDecoder(layers.length);
  const vias: Via[] = [];
  const viaPads = new Map<string, PadShape[]>();
  const backdrillPads = new Map<string, PadShape[]>();
  buildProgress.begin("构建过孔");
  for (const via of db.records(0x33)) {
    const direct = stacks.get(via.Padstack),
      resolved = direct
        ? undefined
        : padstacks.resolveVia(via.Padstack, via.Key),
      stack = direct ?? resolved?.stack;
    if (!stack) {
      diagnostics.push(
        `过孔 ${via.Key} 缺失定义或使用未支持的 Padstack 引用 ${via.Padstack}`,
      );
      continue;
    }
    const reverseLayerOrder = (via.LayerInfo & 0x3000) === 0x3000,
      flipLayers = (via.LayerInfo & 0x2000) !== 0,
      mappedLayer = (i: number) => {
        const source = stack.StartLayer + i;
        return reverseLayerOrder
          ? layers.length - 1 - source
          : flipLayers
            ? layers.length - stack.StartLayer - stack.LayerCount + i
            : source;
      },
      padKey = `${stack.Key}:${reverseLayerOrder ? "reverse" : flipLayers ? "flip" : "normal"}`;
    let pads = viaPads.get(padKey);
    if (!pads) {
      pads = [];
      for (let i = 0; i < stack.LayerCount; i++) {
        const pad =
          stack.Components[
            stack.NumFixedCompEntries + stack.NumCompsPerLayer * i + 2
          ];
        const value = padDecoder.shape(
          pad,
          mappedLayer(i),
          point(pad.OffsetX, pad.OffsetY),
          stack.Key,
        );
        if (value) pads.push(value);
      }
      viaPads.set(padKey, pads);
    }
    const at = point(via.CoordsX, via.CoordsY);
    const firstLayer = mappedLayer(0),
      lastLayer = mappedLayer(stack.LayerCount - 1);
    const placed: Via = {
      id: via.Key,
      net: assignments.get(via.Key) ?? 0,
      at,
      padstack: stack.Key,
      padstackName: db.strings.get(stack.PadStr),
      drill: stack.DrillSize * scale,
      drillShape: padDecoder.drill(stack),
      startLayer: Math.min(firstLayer, lastLayer),
      endLayer: Math.max(firstLayer, lastLayer),
      pads,
    };
    if (stack.PadType === 30) {
      const placement = bondFingers.placement(via, stack);
      if (!placement) {
        diagnostics.push(`键合指 ${via.Key} 的放置或 Padstack 变体尚未支持`);
        continue;
      }
      const fp = db.get(via.UnknownPtr2, 0x2d),
        component = fp?.type === 0x2d ? db.get(fp.InstRef, 0x07) : undefined;
      // Next follows the net chain, not necessarily this finger's bond wire.
      const sourcePinId = bondPins.get(via.Key),
        sourcePin =
          sourcePinId === undefined ? undefined : db.get(sourcePinId, 0x32);
      const pinPad =
        sourcePin?.type === 0x32 && sourcePin.ParentFp === fp?.Key
          ? db.get(sourcePin.PadPtr, 0x0d)
          : undefined;
      Object.assign(placed, placement);
      placed.finger = {
        reference:
          component?.RefDes ??
          lookupString(db.strings, component?.RefDesStrPtr) ??
          "",
        name: pinPad?.Name ?? lookupString(db.strings, pinPad?.NameStrId) ?? "",
        ...(pinPad ? { sourcePin: sourcePin!.Key } : {}),
      };
      placed.pads = pads.map((p) => ({
        ...p,
        offset: new PointShape(p.offset).rotate(placement.angle),
      }));
    }
    if (resolved?.regionCode !== undefined)
      placed.stackupRegion = {
        sourceReference: via.Padstack,
        code: resolved.regionCode,
      };
    if (resolved?.backdrill) {
      const span = resolved.backdrill,
        diameter = span.displayDiameter * scale;
      placed.backdrill = {
        ...span,
        displayDiameter: diameter,
        startPadDiameter: span.startPadDiameter * scale,
        labelDiameter: span.labelDiameter * scale,
        sourceReference: via.Padstack,
        rotationDegrees: via.Unknown5 / 1000,
        mirrored: (via.LayerInfo & 0x100) !== 0,
      };
      const key = `${padKey}:${new BackdrillShape(span).label()}`;
      let effective = backdrillPads.get(key);
      if (!effective) {
        effective = BackdrillShape.applyPads(pads, placed.backdrill);
        backdrillPads.set(key, effective);
      }
      placed.pads = effective;
    }
    vias.push(placed);
    includePads(placed, placed.pads);
    const pause = buildProgress.checkpoint();
    if (pause) await pause;
  }
  return vias;
}
