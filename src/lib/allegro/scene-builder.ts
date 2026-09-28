import { CopperMesh } from "../board/copper-mesh";
import { BOND_TOP_LAYER, BOND_WIRE_TOP_LAYER } from "../board/layers";
import type {
  BoardScene,
  Bounds,
  Layer,
  PadShape,
  Pin,
  Point,
  SceneBuildEvent,
  Segment,
  SpecialLayer,
  Via,
  Zone,
} from "../board/model";
import { ArcShape } from "../board/shapes/arc";
import { BackdrillShape } from "../board/shapes/backdrill";
import { DrillShape as DrillShapeGeometry } from "../board/shapes/drill";
import { PadShape as PadShapeGeometry } from "../board/shapes/pad";
import { PointShape } from "../board/shapes/point";
import { SegmentShape } from "../board/shapes/segment";
import { ZoneShape } from "../board/shapes/zone";
import type { Raw } from "./binary/reader";
import { isLayerListRecord } from "./binary/records/layers";
import type { BrdDatabase } from "./database";
import { AllegroBondFingerDecoder } from "./decoders/bond-finger";
import { AllegroBondWireResolver } from "./decoders/bond-wire";
import { AllegroDrawingBuilder, DIMENSION_LAYER } from "./decoders/drawing";
import { AllegroGeometryDecoder } from "./decoders/geometry";
import { AllegroLayerDecoder } from "./decoders/layers";
import { AllegroPadDecoder } from "./decoders/pad";
import { AllegroPadstackResolver } from "./decoders/padstack";
import { AllegroTextBuilder } from "./decoders/text";
import { AllegroUnits } from "./units";
import { AllegroBuildProgress } from "./build-progress";
import { parserError } from "../parser-error";
const colors = [
  "#58b5ed",
  "#83ce94",
  "#edb963",
  "#ba8bec",
  "#eb819d",
  "#54c7bd",
  "#a5b8df",
  "#e18d61",
];
/** Each build allocates its own decoders and caches; cancellation never poisons a retry. */
export class AllegroSceneBuilder {
  constructor(readonly database: BrdDatabase) {}
  async build(
    signal?: AbortSignal,
    progress?: (label: string) => void,
    trace?: (event: SceneBuildEvent) => void,
  ): Promise<BoardScene> {
    const db = this.database;
    const buildProgress = new AllegroBuildProgress(signal, progress, trace);
    let earlyWork = 0;
    buildProgress.begin("构建层与网络");
    const scale = AllegroUnits.toMillimeters(
      db.header.units,
      db.header.divisor,
    );
    const geometry = new AllegroGeometryDecoder(db, scale);
    const point = (x: number, y: number): Point => [x * scale, y * scale];
    const layerList = db.get(db.header.layerMap[6]?.recordId);
    if (!isLayerListRecord(layerList)) throw parserError("brdMissingLayers");
    const layers: Layer[] = layerList.Entries.map((entry, id) => {
      const properties = "Properties" in entry ? entry.Properties : undefined;
      return {
        id,
        name:
          "Name" in entry
            ? entry.Name
            : (db.strings.get(entry.NameId) ?? `Layer ${id + 1}`),
        color: colors[id % colors.length],
        layerFunction: AllegroLayerDecoder.functionFromFlags(properties),
        sourceFlags: properties,
      };
    });
    const bondWires = new AllegroBondWireResolver(
      (id) => db.get(id),
      db.strings,
      db.header.version,
      layers.length,
    );
    const bondFingers = new AllegroBondFingerDecoder(layers.length);
    const nets = new Map<number, string>();
    for (const net of db.records(0x1b)) {
      nets.set(net.Key, db.strings.get(net.NetName) ?? "");
      if ((++earlyWork & 255) === 0) await buildProgress.checkpoint();
    }
    const assignments = new Map<number, number>();
    buildProgress.begin("解析网络连接");
    for (const assignment of db.records(4)) {
      let key = assignment.ConnItem;
      const visited = new Set<number>();
      while (key && key !== assignment.Key) {
        if (visited.has(key))
          throw parserError("brdNetChainLoop", { detail: key });
        visited.add(key);
        const item = db.get(key);
        if (!item)
          throw parserError("brdNetConnectionMissing", { detail: key });
        assignments.set(key, assignment.Net);
        key = item.Next;
        // A single MCM network can contain hundreds of thousands of objects.
        // Check inside its chain, not only between whole networks.
        if ((++earlyWork & 255) === 0) await buildProgress.checkpoint();
      }
      if ((++earlyWork & 255) === 0) await buildProgress.checkpoint();
    }
    const segments: Segment[] = [],
      vias: Via[] = [],
      pins: Pin[] = [],
      zones: Zone[] = [],
      outline: Segment[] = [],
      diagnostics: string[] = [];
    const bondPins = new Map<number, number | undefined>();
    const specialLayers: SpecialLayer[] = [];
    const bounds: Bounds = {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    };
    function include(p: Point, r = 0) {
      bounds.minX = Math.min(bounds.minX, p[0] - r);
      bounds.minY = Math.min(bounds.minY, p[1] - r);
      bounds.maxX = Math.max(bounds.maxX, p[0] + r);
      bounds.maxY = Math.max(bounds.maxY, p[1] + r);
    }
    buildProgress.begin("构建走线");
    for (const track of db.records(5)) {
      if ((track.Layer & 255) !== 6) continue;
      if (track.Layer === 0xfd06) {
        const finger = db.get(track.Unknown5a),
          pin = db.get(track.Unknown4);
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
        await buildProgress.checkpoint();
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
        if (![1, 0x15, 0x16, 0x17].includes(record.type)) {
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
        if ((segments.length & 255) === 0) await buildProgress.checkpoint();
      }
      await buildProgress.checkpoint();
    }
    const stacks = new Map<number, Raw>();
    buildProgress.begin("读取 Padstack");
    for (const stack of db.records(0x1c)) {
      stacks.set(stack.Key, stack);
      if ((++earlyWork & 31) === 0) await buildProgress.checkpoint();
    }
    const padDecoder = new AllegroPadDecoder(geometry, scale, diagnostics);
    function includePads(owner: Pin | Via, pads: PadShape[]) {
      const hole = new DrillShapeGeometry(owner).pad();
      for (const p of hole ? [...pads, hole] : pads) {
        const b = new PadShapeGeometry(p).bounds(owner);
        include([b.minX, b.minY]);
        include([b.maxX, b.maxY]);
      }
    }
    const viaPads = new Map<string, PadShape[]>();
    const backdrillPads = new Map<string, PadShape[]>();
    const getStackRecord = (id: number) => stacks.get(id) ?? db.get(id);
    const padstacks = new AllegroPadstackResolver(
      getStackRecord,
      layers.length,
      db.header.version,
    );
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
        const fp = db.get(via.UnknownPtr2),
          component = fp?.type === 0x2d ? db.get(fp.InstRef) : undefined;
        // Next follows the net chain, not necessarily this finger's bond wire.
        const sourcePinId = bondPins.get(via.Key),
          sourcePin =
            sourcePinId === undefined ? undefined : db.get(sourcePinId);
        const pinPad =
          sourcePin?.type === 0x32 && sourcePin.ParentFp === fp?.Key
            ? db.get(sourcePin.PadPtr)
            : undefined;
        Object.assign(placed, placement);
        placed.finger = {
          reference: db.strings.get(component?.RefDesStrPtr) ?? "",
          name: db.strings.get(pinPad?.NameStrId) ?? "",
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
      await buildProgress.checkpoint();
    }
    buildProgress.begin("构建器件焊盘");
    for (const fp of db.records(0x2d)) {
      const component = db.get(fp.InstRef),
        reference = db.strings.get(component?.RefDesStrPtr) ?? "";
      const origin = point(fp.CoordX, fp.CoordY),
        angle = (fp.Rotation * Math.PI) / 180000,
        back = fp.Layer !== 0;
      const visited = new Set<number>();
      let key = fp.FirstPadPtr;
      while (key && key !== fp.Key) {
        if (visited.has(key))
          throw parserError("brdPadChainLoop", { detail: key });
        visited.add(key);
        const placed = db.get(key);
        if (placed?.type !== 50) {
          diagnostics.push(`器件 ${reference} 缺失焊盘 ${key}`);
          break;
        }
        const pad = db.get(placed.PadPtr),
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
          const offsetLocal = new PointShape(
            point(p.OffsetX, p.OffsetY),
          ).rotate(localAngle);
          const offset = new PointShape([
            back ? -offsetLocal[0] : offsetLocal[0],
            offsetLocal[1],
          ]).rotate(angle);
          const value = padDecoder.shape(p, layer, offset, stack.Key);
          if (value) shapes.push(value);
        }
        const assignment = db.get(placed.NetPtr);
        const pin: Pin = {
          id: placed.Key,
          net: assignment?.Net ?? assignments.get(placed.Key) ?? 0,
          name: db.strings.get(pad.NameStrId) ?? "",
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
        await buildProgress.checkpoint();
      }
    }
    buildProgress.begin("构建铜皮");
    for (const shape of db.records(40)) {
      // Non-copper and unassigned shapes can dominate the source list. Keep
      // checkpoints before all skip branches, not just after displayed zones.
      if ((++earlyWork & 255) === 0) await buildProgress.checkpoint();
      const classId = shape.Layer & 255,
        layer = shape.Layer >>> 8;
      if (classId === 1 && [0xea, 0xfd].includes(layer)) {
        const path = geometry.readPath(shape.FirstSegmentPtr);
        outline.push(...path);
        for (const s of path) {
          include(s.a);
          include(s.b);
        }
        continue;
      }
      // The net connection chain contains the stored computed copper, not just the
      // user-drawn zone boundary. Never fill unrelated boundary/keepout classes.
      if (classId !== 6 || !assignments.has(shape.Key) || !layers[layer])
        continue;
      if ((shape.Unknown2 & 255) === 2) {
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
          if (hatch?.type !== 0x20)
            throw parserError("brdHatchLineMissing", {
              detail: shape.Key,
              value: key,
            });
          addPath(hatch.UnknownArray1[0]);
          key = hatch.Next;
          await buildProgress.checkpoint();
        }
        const holeSeen = new Set<number>();
        for (let key = shape.FirstKeepoutPtr; key;) {
          if (holeSeen.has(key))
            throw parserError("brdHatchHoleLoop", {
              detail: shape.Key,
              value: key,
            });
          holeSeen.add(key);
          const hole = db.get(key);
          if (hole?.type !== 0x34)
            throw parserError("brdHatchHoleMissing", {
              detail: shape.Key,
              value: key,
            });
          addPath(hole.FirstSegmentPtr);
          key = hole.Next;
          await buildProgress.checkpoint();
        }
        continue;
      }
      const { paths, rings } = await geometry.readContours(shape.Key, signal);
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
      const mesh = await new CopperMesh(rings).build(signal, paths),
        zone: Zone = {
          id: shape.Key,
          layer,
          net: assignments.get(shape.Key)!,
          paths,
          rings: [],
          ...mesh,
        };
      zones.push(zone);
      trace?.({
        stage: "铜皮三角化",
        event: "end",
        id: shape.Key,
        ms: performance.now() - meshStart,
        triangles: mesh.indices.length / 3,
      });
      const b = new ZoneShape(zone).bounds();
      include([b.minX, b.minY]);
      include([b.maxX, b.maxY]);
      await buildProgress.checkpoint();
    }
    for (const kind of [0x0e, 0x24]) {
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
        const mesh = await new CopperMesh([corners]).build(signal, [path]),
          zone: Zone = {
            id: rect.Key,
            layer,
            net: assignments.get(rect.Key)!,
            paths: [path],
            rings: [],
            ...mesh,
          };
        zones.push(zone);
        const box = new ZoneShape(zone).bounds();
        include([box.minX, box.minY]);
        include([box.maxX, box.maxY]);
        await buildProgress.checkpoint();
      }
    }
    buildProgress.begin("构建板框");
    const dimensionGraphics: Raw[] = [];
    let graphicWork = 0;
    for (const graphic of db.records(20)) {
      if (
        (graphic.Layer & 255) === 1 &&
        [0xea, 0xfd].includes(graphic.Layer >>> 8)
      )
        outline.push(...geometry.readPath(graphic.SegmentPtr));
      if (graphic.Layer === 0xf901) dimensionGraphics.push(graphic);
      if ((++graphicWork & 255) === 0) await buildProgress.checkpoint();
    }
    if (!Number.isFinite(bounds.minX)) throw parserError("brdNoGeometry");
    buildProgress.begin("构建原始文字");
    const { texts, drawingLayers } = await new AllegroTextBuilder(
      db,
      scale,
    ).build(diagnostics, signal);
    buildProgress.begin("构建尺寸图形");
    const drawings = await new AllegroDrawingBuilder(db, scale).build(
      dimensionGraphics,
      texts,
      diagnostics,
      signal,
    );
    if (
      drawings.length &&
      !drawingLayers.some((l) => l.id === DIMENSION_LAYER)
    ) {
      drawingLayers.push(AllegroLayerDecoder.drawingLayer(0xf901));
      drawingLayers.sort(
        (a, b) =>
          Number(b.defaultVisible) - Number(a.defaultVisible) || a.id - b.id,
      );
    }
    buildProgress.finish();
    return {
      layers,
      ...(specialLayers.length ? { specialLayers } : {}),
      nets,
      segments,
      vias,
      pins,
      zones,
      outline,
      texts,
      drawingLayers,
      drawings,
      bounds,
      diagnostics,
    };
  }
}
