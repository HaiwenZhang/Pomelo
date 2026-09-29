import { decodeAllegroSegment } from "../decoders/segment";
import { isRecordType } from "../binary/record-types";
import { BOND_WIRE_TOP_LAYER } from "../../board/layers";
import type { Segment, SpecialLayer } from "../../board/model";
import { parserError } from "../../parser-error";
import { AllegroBondWireResolver } from "../decoders/bond-wire";
import type { AllegroSceneContext } from "./context";

export async function buildRoutes(
  context: AllegroSceneContext,
  assignments: ReadonlyMap<number, number>,
) {
  const {
    database: db,
    scale,
    layers,
    point,
    include,
    diagnostics,
    buildProgress,
  } = context;
  const bondWires = new AllegroBondWireResolver(
    (id) => db.get(id),
    db.strings,
    db.header.version,
    layers.length,
  );
  const segments: Segment[] = [];
  const bondPins = new Map<number, number | undefined>();
  const specialLayers: SpecialLayer[] = [];
  buildProgress.begin("构建走线");
  for (const track of db.records(5)) {
    if ((track.Layer & 255) !== 6) continue;
    if (track.Layer === 0xfd06) {
      const finger = db.get(track.Unknown5a, 0x33),
        pin = db.get(track.Unknown4, 0x32);
      if (
        finger?.type === 0x33 &&
        pin?.type === 0x32 &&
        pin.ParentFp === track.UnknownPtr2a &&
        finger.UnknownPtr2 === pin.ParentFp
      ) {
        const previous = bondPins.get(finger.Key);
        bondPins.set(
          finger.Key,
          !bondPins.has(finger.Key) || previous === pin.Key
            ? pin.Key
            : undefined,
        );
      }
      const resolved = bondWires.resolve(track);
      if (!resolved) {
        diagnostics.push(
          `键合线 ${track.Key} 的端点、profile 或段变体尚未支持`,
        );
        continue;
      }
      const r = resolved.segment,
        a = point(r.StartX, r.StartY),
        b = point(r.EndX, r.EndY),
        width = r.Width * scale;
      segments.push({
        id: r.Key,
        trackId: track.Key,
        layer: BOND_WIRE_TOP_LAYER,
        net: resolved.net,
        a,
        b,
        width,
        bondWire: resolved.wire,
      });
      if (!specialLayers.some((l) => l.id === BOND_WIRE_TOP_LAYER))
        specialLayers.push({
          id: BOND_WIRE_TOP_LAYER,
          name: "Bond wire / TOP",
          color: "#e4d95b",
          kind: "bond-wire",
          category: "bond-wire",
        });
      include(a, width / 2);
      include(b, width / 2);
      const pause = buildProgress.checkpoint();
      if (pause) await pause;
      continue;
    }
    const layer = track.Layer >>> 8;
    if (!layers[layer]) {
      diagnostics.push(`走线 ${track.Key} 的层 ${layer} 未定义`);
      continue;
    }
    let key = track.FirstSegPtr;
    const visited = new Set<number>();
    while (key && key !== track.Key) {
      if (visited.has(key))
        throw parserError("brdTraceChainLoop", { detail: track.Key });
      visited.add(key);
      const record = db.get(key);
      if (!record) {
        diagnostics.push(`走线 ${track.Key} 缺失段 ${key}`);
        break;
      }
      if (!isRecordType(record, [1, 0x15, 0x16, 0x17] as const)) {
        diagnostics.push(`走线 ${track.Key} 的链表遇到类型 ${record.type}`);
        break;
      }
      const segment = decodeAllegroSegment(record, scale);
      segment.trackId = track.Key;
      segment.layer = layer;
      segment.net = assignments.get(track.Key) ?? 0;
      context.extent.includeSegment(segment);
      segments.push(segment);
      key = record.Next;
      if ((segments.length & 255) === 0) {
        const pause = buildProgress.checkpoint();
        if (pause) await pause;
      }
    }
    const pause = buildProgress.checkpoint();
    if (pause) await pause;
  }
  return { segments, bondPins, specialLayers };
}
