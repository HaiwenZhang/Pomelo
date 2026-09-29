import { isRecordType } from "../binary/record-types";
import { createCopperZone } from "../../board/copper-zone";
import type { Point, SceneBuildEvent, Segment, Zone } from "../../board/model";
import { SegmentShape } from "../../board/shapes/segment";
import { ZoneShape } from "../../board/shapes/zone";
import { parserError } from "../../parser-error";
import type { AllegroSceneContext } from "./context";
/** Hatch strokes append after routes in the original source order. */
export async function buildCopper(
  context: AllegroSceneContext,
  assignments: ReadonlyMap<number, number>,
  segments: Segment[],
  trace?: (event: SceneBuildEvent) => void,
) {
  const {
    database: db,
    scale,
    layers,
    geometry,
    diagnostics,
    include,
    buildProgress,
    signal,
  } = context;
  const zones: Zone[] = [];
  const outline: Segment[] = [];
  let earlyWork = 0;
  buildProgress.begin("构建铜皮");
  for (const shape of db.records(40)) {
    // Non-copper and unassigned shapes can dominate the source list. Keep
    // checkpoints before all skip branches, not just after displayed zones.
    if ((++earlyWork & 255) === 0) {
      const pause = buildProgress.checkpoint();
      if (pause) await pause;
    }
    const classId = shape.Layer & 255,
      layer = shape.Layer >>> 8;
    if (classId === 1 && [0xea, 0xfd].includes(layer)) {
      const path = geometry.readPath(shape.FirstSegmentPtr);
      outline.push(...path);
      for (const s of path) context.extent.includeSegment(s);
      continue;
    }
    // The net connection chain contains the stored computed copper, not just the
    // user-drawn zone boundary. Never fill unrelated boundary/keepout classes.
    if (classId !== 6 || !assignments.has(shape.Key) || !layers[layer])
      continue;
    if (((shape.Unknown2 ?? 0) & 255) === 2) {
      const net = assignments.get(shape.Key)!;
      const addPath = (first: number) => {
        for (const segment of geometry.readPath(first, true)) {
          segment.layer = layer;
          segment.net = net;
          segment.trackId = shape.Key;
          segments.push(segment);
          const box = new SegmentShape(segment).bounds();
          include([box.minX, box.minY]);
          include([box.maxX, box.maxY]);
        }
      };
      addPath(shape.FirstSegmentPtr);
      const hatchSeen = new Set<number>();
      for (let key = shape.Unknown4; key && key !== shape.Key;) {
        if (hatchSeen.has(key))
          throw parserError("brdHatchLineLoop", {
            detail: shape.Key,
            value: key,
          });
        hatchSeen.add(key);
        const hatch = db.get(key);
        if (!isRecordType(hatch, 0x20))
          throw parserError("brdHatchLineMissing", {
            detail: shape.Key,
            value: key,
          });
        addPath(hatch.UnknownArray1[0]);
        key = hatch.Next;
        const pause = buildProgress.checkpoint();
        if (pause) await pause;
      }
      const holeSeen = new Set<number>();
      // Native V251 hatch holes can terminate at their owning shape.
      for (let key = shape.FirstKeepoutPtr; key && key !== shape.Key;) {
        if (holeSeen.has(key))
          throw parserError("brdHatchHoleLoop", {
            detail: shape.Key,
            value: key,
          });
        holeSeen.add(key);
        const hole = db.get(key);
        if (!isRecordType(hole, 0x34))
          throw parserError("brdHatchHoleMissing", {
            detail: shape.Key,
            value: key,
          });
        addPath(hole.FirstSegmentPtr);
        key = hole.Next;
        const pause = buildProgress.checkpoint();
        if (pause) await pause;
      }
      continue;
    }
    const { paths, rings } = await geometry.readContours(shape, signal);
    if (!rings.length) {
      diagnostics.push(`铜皮 ${shape.Key} 无有效边界`);
      continue;
    }
    const meshStart = performance.now();
    trace?.({
      stage: "铜皮三角化",
      event: "start",
      id: shape.Key,
      rings: rings.length,
      vertices: rings.reduce((sum, ring) => sum + ring.length, 0),
    });
    const zone = await createCopperZone(
      { id: shape.Key, layer, net: assignments.get(shape.Key)!, paths, rings },
      signal,
    );
    zones.push(zone);
    trace?.({
      stage: "铜皮三角化",
      event: "end",
      id: shape.Key,
      ms: performance.now() - meshStart,
      triangles: zone.indices.length / 3,
    });
    const b = new ZoneShape(zone).bounds();
    include([b.minX, b.minY]);
    include([b.maxX, b.maxY]);
    const pause = buildProgress.checkpoint();
    if (pause) await pause;
  }
  for (const kind of [0x0e, 0x24] as const) {
    for (const rect of db.records(kind)) {
      if ((rect.Layer & 255) !== 6 || !assignments.has(rect.Key)) continue;
      const layer = rect.Layer >>> 8;
      if (!layers[layer])
        throw parserError("brdCopperRectangleLayerMissing", {
          detail: rect.Key,
          value: layer,
        });
      const [x, y, u, v] = rect.Coords,
        angle = (rect.Rotation * Math.PI) / 180000,
        dx = u - x,
        dy = v - y,
        c = Math.cos(angle),
        s = Math.sin(angle),
        corners: Point[] = (
          [
            [0, 0],
            [dx, 0],
            [dx, dy],
            [0, dy],
          ] as Point[]
        ).map(([a, b]) => [
          (x + a * c - b * s) * scale,
          (y + a * s + b * c) * scale,
        ]);
      const path: Segment[] = corners.map((a, index) => ({
        id: rect.Key,
        trackId: rect.Key,
        layer,
        net: assignments.get(rect.Key)!,
        a,
        b: corners[(index + 1) % corners.length],
        width: 0,
      }));
      const zone = await createCopperZone(
        {
          id: rect.Key,
          layer,
          net: assignments.get(rect.Key)!,
          paths: [path],
          rings: [corners],
        },
        signal,
      );
      zones.push(zone);
      const box = new ZoneShape(zone).bounds();
      include([box.minX, box.minY]);
      include([box.maxX, box.maxY]);
      const pause = buildProgress.checkpoint();
      if (pause) await pause;
    }
  }
  return { zones, outline };
}
