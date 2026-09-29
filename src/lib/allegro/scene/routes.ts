import { isRecordType } from "../binary/record-types";
import { BOND_WIRE_TOP_LAYER } from "../../board/layers";
import type { Segment, SpecialLayer } from "../../board/model";
import { ArcShape } from "../../board/shapes/arc";
import { SegmentShape } from "../../board/shapes/segment";
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
      const a = point(record.StartX, record.StartY),
        b = point(record.EndX, record.EndY);
      const segment: Segment = {
        id: record.Key,
        trackId: track.Key,
        layer,
        net: assignments.get(track.Key) ?? 0,
        a,
        b,
        width: record.Width * scale,
      };
      if (record.type === 1) {
        const center = point(record.CenterX, record.CenterY),
          radius = Math.hypot(a[0] - center[0], a[1] - center[1]);
        const start = Math.atan2(a[1] - center[1], a[0] - center[0]),
          end = Math.atan2(b[1] - center[1], b[0] - center[0]);
        segment.arc = {
          center,
          radius,
          start,
          sweep: ArcShape.sweep(start, end, (record.SubType & 0x40) !== 0),
        };
        const box = new SegmentShape(segment).bounds();
        include([box.minX, box.minY]);
        include([box.maxX, box.maxY]);
      } else {
        include(a, segment.width / 2);
        include(b, segment.width / 2);
      }
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
