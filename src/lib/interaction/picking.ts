import { BoardDisplay } from "../board/display";
import type {
  BoardDrawing,
  BoardScene,
  Bounds,
  PadShape,
  Pin,
  Point,
  Segment,
  Via,
  Zone,
} from "../board/model";
import { DrillShape } from "../board/shapes/drill";
import { LineShape } from "../board/shapes/line";
import type { PadPlacement } from "../board/shapes/pad";
import { PadShape as PadShapeGeometry } from "../board/shapes/pad";
import { pinDisplayCategory } from "../board/shapes/pin";
import { SegmentShape } from "../board/shapes/segment";
import { ViaShape } from "../board/shapes/via";
import { ZoneShape } from "../board/shapes/zone";

import { type DisplayCategory, type DisplayOptions } from "../board/display";
import type { SearchItem } from "../board/search";
import { PolygonShape } from "../board/shapes/polygon";
import { cooperative } from "../cooperative";
export const lineDistance = (point: Point, a: Point, b: Point) =>
  new LineShape(a, b).distance(point);
export const segmentDistance = (point: Point, segment: Segment) =>
  new SegmentShape(segment).distance(point);
export const insideRing = PolygonShape.containsRing;
export const insideRings = (point: Point, rings: Point[][]) =>
  new PolygonShape(rings).contains(point);
export const padDistance = (point: Point, pad: PadShape, owner: PadPlacement) =>
  new PadShapeGeometry(pad).distance(point, owner);

import {
  BoardTextStrokeBuilder,
  type TextStroke,
} from "../text/board-text-stroke-builder";

export type BoardObject =
  | { kind: "drawing"; value: BoardDrawing }
  | { kind: "segment"; value: Segment }
  | { kind: "bond-wire"; value: Segment }
  | { kind: "via"; value: Via }
  | { kind: "finger"; value: Via }
  | { kind: "pin"; value: Pin }
  | { kind: "zone"; value: Zone };
export type PickFilter = "all" | BoardObject["kind"];
export type SelectionMode = "object" | "track" | "net" | "component";
export interface PickHit {
  object: BoardObject;
  layer: number;
  category: DisplayCategory;
  distance: number;
}
export interface Selection {
  anchor: PickHit;
  mode: SelectionMode;
  objects: BoardObject[];
}
interface Entry {
  object: BoardObject;
  layer: number;
  category: DisplayCategory;
  bounds: Bounds;
  pad?: PadShape;
  sequence: number;
  viaLayers?: readonly number[];
  backdrill?: boolean;
  backdrillBase?: boolean;
  segment?: Segment;
  strokes?: TextStroke[];
}
// Pads on different layers keep distinct hit records, but share one spatial
// tree entry per source object. Test each original bound after the broad phase.
type SpatialEntry = Entry | { bounds: Bounds; members: Entry[] };
interface SpatialNode {
  bounds: Bounds;
  left?: SpatialNode;
  right?: SpatialNode;
  entries?: SpatialEntry[];
}
const emptyBounds = (): Bounds => ({
  minX: Infinity,
  minY: Infinity,
  maxX: -Infinity,
  maxY: -Infinity,
});
function include(bounds: Bounds, p: Point, r = 0) {
  bounds.minX = Math.min(bounds.minX, p[0] - r);
  bounds.maxX = Math.max(bounds.maxX, p[0] + r);
  bounds.minY = Math.min(bounds.minY, p[1] - r);
  bounds.maxY = Math.max(bounds.maxY, p[1] + r);
}
function overlaps(a: Bounds, b: Bounds) {
  return (
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
  );
}
function sameBounds(a: Bounds, b: Bounds) {
  return (
    Object.is(a.minX, b.minX) &&
    Object.is(a.minY, b.minY) &&
    Object.is(a.maxX, b.maxX) &&
    Object.is(a.maxY, b.maxY)
  );
}
function containsBounds(a: Bounds, b: Bounds) {
  return (
    a.minX <= b.minX && a.minY <= b.minY && a.maxX >= b.maxX && a.maxY >= b.maxY
  );
}
function sharedPadBounds(
  pad: PadShape,
  owner: PadPlacement,
  values: Bounds[],
  scratch: Bounds,
) {
  new PadShapeGeometry(pad).bounds(owner, scratch);
  for (const existing of values)
    if (sameBounds(existing, scratch)) return existing;
  const bounds = { ...scratch };
  values.push(bounds);
  return bounds;
}
function* buildSpatialNode(
  entries: SpatialEntry[],
  start = 0,
  end = entries.length,
): Generator<void, SpatialNode> {
  const bounds = emptyBounds();
  for (let i = start; i < end; i++) {
    const e = entries[i];
    include(bounds, [e.bounds.minX, e.bounds.minY]);
    include(bounds, [e.bounds.maxX, e.bounds.maxY]);
    if ((i & 16383) === 0) yield;
  }
  if (end - start <= 16) return { bounds, entries: entries.slice(start, end) };
  const x = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY;
  const key = (entry: SpatialEntry) =>
    x
      ? entry.bounds.minX + entry.bounds.maxX
      : entry.bounds.minY + entry.bounds.maxY;
  const mid = (start + end) >>> 1;
  // In-place median partition replaces synchronous sorts and recursive copies.
  let low = start,
    high = end - 1,
    work = 0;
  while (low < high) {
    const pivot = key(entries[(low + high) >>> 1]);
    let a = low,
      b = high;
    while (a <= b) {
      while (key(entries[a]) < pivot) {
        a++;
        if ((++work & 16383) === 0) yield;
      }
      while (key(entries[b]) > pivot) {
        b--;
        if ((++work & 16383) === 0) yield;
      }
      if (a <= b) {
        const swap = entries[a];
        entries[a++] = entries[b];
        entries[b--] = swap;
      }
      if ((++work & 16383) === 0) yield;
    }
    if (mid <= b) high = b;
    else if (mid >= a) low = a;
    else break;
  }
  return {
    bounds,
    left: yield* buildSpatialNode(entries, start, mid),
    right: yield* buildSpatialNode(entries, mid, end),
  };
}
export class BoardIndex {
  private root: SpatialNode = { bounds: emptyBounds(), entries: [] };
  readonly objects: BoardObject[] = [];
  private nets = new Map<number, BoardObject[]>();
  private tracks = new Map<number, BoardObject[]>();
  private components = new Map<string, BoardObject[]>();
  private entriesByObject = new Map<BoardObject, Entry[]>();
  lastCandidateCount = 0;
  constructor(
    readonly scene: BoardScene,
    deferred = false,
  ) {
    if (!deferred) for (const _ of this.build()) void _;
  }
  static async create(scene: BoardScene, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const index = new BoardIndex(scene, true),
      checkpoint = cooperative(signal);
    for (const _ of index.build()) {
      void _;
      const pause = checkpoint();
      if (pause) await pause;
    }
    signal?.throwIfAborted();
    return index;
  }
  private *build(): Generator<void> {
    const scene = this.scene;
    let work = 0;
    const entries: Entry[] = [];
    const add = (
      object: BoardObject,
      layer: number,
      category: DisplayCategory,
      bounds: Bounds,
      pad?: PadShape,
    ) =>
      entries.push({
        object,
        layer,
        category,
        bounds,
        pad,
        sequence: entries.length,
      });
    for (const value of scene.segments) {
      if ((++work & 2047) === 0) yield;
      const object: BoardObject = {
          kind: value.bondWire ? "bond-wire" : "segment",
          value,
        },
        bounds = new SegmentShape(value).bounds();
      this.objects.push(object);
      add(
        object,
        value.layer,
        new SegmentShape(value).displayCategory(),
        bounds,
      );
      const track = this.tracks.get(value.trackId) ?? [];
      track.push(object);
      this.tracks.set(value.trackId, track);
    }
    for (const value of scene.zones) {
      if ((++work & 2047) === 0) yield;
      const object: BoardObject = { kind: "zone", value },
        bounds = new ZoneShape(value).bounds();
      this.objects.push(object);
      if (Number.isFinite(bounds.minX))
        add(object, value.layer, "zone", bounds);
    }
    const drawingTextOwners = new Map<number, BoardObject>();
    for (const value of scene.drawings ?? []) {
      const object: BoardObject = { kind: "drawing", value };
      this.objects.push(object);
      for (const segment of value.segments) {
        entries.push({
          object,
          layer: value.layer,
          category: "drawing",
          bounds: new SegmentShape(segment).bounds(),
          segment,
          sequence: entries.length,
        });
        if ((++work & 2047) === 0) yield;
      }
      for (const text of value.texts) drawingTextOwners.set(text.id, object);
    }
    // Text submission follows scene.texts, which can differ from owner/graphic
    // chain order. The last visible overlapping stroke must win in both paths.
    if (drawingTextOwners.size)
      for (const text of scene.texts) {
        const object = drawingTextOwners.get(text.id);
        if (object) {
          const strokes = BoardTextStrokeBuilder.build(text),
            bounds = emptyBounds();
          for (const stroke of strokes) {
            include(bounds, stroke.a, stroke.width / 2);
            include(bounds, stroke.b, stroke.width / 2);
          }
          if (strokes.length)
            entries.push({
              object,
              layer: text.layer,
              category: "text",
              bounds,
              strokes,
              sequence: entries.length,
            });
        }
        if ((++work & 255) === 0) yield;
      }
    const pads: Entry[][] = [[], []];
    const padBoundsScratch = emptyBounds();
    const basePads: Entry[] = [];
    const backdrills = new Map<string, Entry[]>();
    const holes = new Map<string, { vias: Entry[]; pins: Entry[] }>([
      ["", { vias: [], pins: [] }],
    ]);
    for (const kind of ["pin", "via"] as const)
      for (const value of kind === "pin" ? scene.pins : scene.vias) {
        if ((++work & 127) === 0) yield;
        const object = {
          kind:
            kind === "via" && "finger" in value && value.finger
              ? "finger"
              : kind,
          value,
        } as BoardObject;
        this.objects.push(object);
        const shapes: PadShape[] =
          "shapes" in value ? value.shapes : value.pads;
        // Share exact world-space bounds immediately, before layer sorting.
        // The scratch box never escapes into a hit record or spatial node.
        const padBoundsValues: Bounds[] = [];
        for (const pad of shapes) {
          if ((++work & 127) === 0) yield;
          if (!new PadShapeGeometry(pad).supported() || pad.backdrill) continue;
          const entry: Entry = {
            object,
            layer: pad.layer,
            category: "shapes" in value ? pinDisplayCategory(value) : "via",
            bounds: sharedPadBounds(
              pad,
              value,
              padBoundsValues,
              padBoundsScratch,
            ),
            pad,
            backdrillBase: pad.backdrillBase,
            sequence: 0,
          };
          if (pad.backdrillBase) basePads.push(entry);
          else pads[Number(!!pad.custom)].push(entry);
        }
        const hole = new DrillShape(value).pad();
        if (hole) {
          const viaLayers =
            "pads" in value
              ? new ViaShape(value).drillLayers(scene.layers.length)
              : undefined;
          const key =
            viaLayers === undefined ? "" : `via:${viaLayers.join(",")}`;
          let group = holes.get(key);
          if (!group) {
            group = { vias: [], pins: [] };
            holes.set(key, group);
          }
          group[kind === "via" ? "vias" : "pins"].push({
            object,
            layer: -1,
            category: "drill",
            bounds: sharedPadBounds(
              hole,
              value,
              padBoundsValues,
              padBoundsScratch,
            ),
            pad: hole,
            sequence: 0,
            viaLayers,
          });
        }
        if ("pads" in value && value.backdrill) {
          const pad = value.pads.find((p) => p.backdrill)!;
          const viaLayers = new ViaShape(value).backdrillLayers(),
            key = viaLayers.join(",");
          let group = backdrills.get(key);
          if (!group) {
            group = [];
            backdrills.set(key, group);
          }
          group.push({
            object,
            layer: -1,
            category: "drill",
            bounds: sharedPadBounds(
              pad,
              value,
              padBoundsValues,
              padBoundsScratch,
            ),
            pad,
            sequence: 0,
            viaLayers,
            backdrill: true,
          });
        }
      }
    // Match primitive drill grouping and within-group source order, including
    // coincident through/BB holes. Copper pad sorting remains independent.
    for (const group of holes.values())
      for (const list of [group.vias, group.pins])
        for (const entry of list) {
          if ((++work & 16383) === 0) yield;
          entry.sequence = entries.length;
          entries.push(entry);
        }
    for (const group of backdrills.values())
      for (const entry of group) {
        entry.sequence = entries.length;
        entries.push(entry);
      }
    // Custom pin triangles are submitted after analytic pin pads in each layer.
    for (const group of [basePads, ...pads])
      for (const entry of group) {
        if ((++work & 16383) === 0) yield;
        entry.sequence = entries.length;
        entries.push(entry);
      }
    for (const object of this.objects) {
      if ((++work & 2047) === 0) yield;
      if (object.value.net) {
        const members = this.nets.get(object.value.net) ?? [];
        members.push(object);
        this.nets.set(object.value.net, members);
      }
      const reference =
        object.kind === "pin"
          ? object.value.reference
          : object.kind === "finger"
            ? object.value.finger?.reference
            : undefined;
      if (reference) {
        const members = this.components.get(reference) ?? [];
        members.push(object);
        this.components.set(reference, members);
      }
    }
    for (const entry of entries) {
      if ((++work & 16383) === 0) yield;
      const values = this.entriesByObject.get(entry.object);
      if (values) values.push(entry);
      else this.entriesByObject.set(entry.object, [entry]);
    }
    const spatial: SpatialEntry[] = [];
    for (const grownMembers of this.entriesByObject.values()) {
      // These lists are immutable after grouping. Copy once to avoid retaining
      // push-growth capacity for millions of mostly small object memberships.
      // The map and spatial group must keep the same compact list, not both.
      const members =
        grownMembers.length === 1 ? grownMembers : grownMembers.slice();
      if (members !== grownMembers)
        this.entriesByObject.set(members[0].object, members);
      if (members.length === 1) spatial.push(members[0]);
      else {
        let bounds = members[0].bounds,
          owned = false;
        for (const entry of members) {
          if (!containsBounds(bounds, entry.bounds)) {
            if (containsBounds(entry.bounds, bounds)) {
              bounds = entry.bounds;
              owned = false;
            } else {
              // Never expand a box owned by a layer's exact hit record.
              if (!owned) {
                bounds = { ...bounds };
                owned = true;
              }
              bounds.minX = Math.min(bounds.minX, entry.bounds.minX);
              bounds.minY = Math.min(bounds.minY, entry.bounds.minY);
              bounds.maxX = Math.max(bounds.maxX, entry.bounds.maxX);
              bounds.maxY = Math.max(bounds.maxY, entry.bounds.maxY);
            }
          }
          if ((++work & 16383) === 0) yield;
        }
        spatial.push({ bounds, members });
      }
      if ((++work & 16383) === 0) yield;
    }
    this.root = yield* buildSpatialNode(spatial);
  }
  pick(
    point: Point,
    scale: number,
    display: DisplayOptions,
    filter: PickFilter = "all",
    pixels = 5,
  ): PickHit | null {
    if (display.opacity <= 0 || scale <= 0) return null;
    const tolerance = pixels / scale,
      query = {
        minX: point[0] - tolerance,
        maxX: point[0] + tolerance,
        minY: point[1] - tolerance,
        maxY: point[1] + tolerance,
      };
    const candidates: Entry[] = [];
    const visit = (node: SpatialNode) => {
      if (!overlaps(node.bounds, query)) return;
      if (node.entries) {
        for (const entry of node.entries)
          if (overlaps(entry.bounds, query)) {
            if ("members" in entry) {
              for (const member of entry.members)
                if (overlaps(member.bounds, query)) candidates.push(member);
            } else candidates.push(entry);
          }
      } else {
        if (node.left) visit(node.left);
        if (node.right) visit(node.right);
      }
    };
    visit(this.root);
    this.lastCandidateCount = candidates.length;
    const hits: (PickHit & { sequence: number })[] = [];
    for (const entry of candidates) {
      const { object, layer, category } = entry;
      if (
        (filter !== "all" && object.kind !== filter) ||
        !BoardDisplay.isBatchVisible(display, entry)
      )
        continue;
      let distance = Infinity,
        hitCategory = category;
      if (
        category === "drill" &&
        entry.pad &&
        (object.kind === "via" ||
          object.kind === "finger" ||
          object.kind === "pin")
      )
        distance = new PadShapeGeometry(entry.pad).distance(
          point,
          object.value,
        );
      else if (object.kind === "segment" || object.kind === "bond-wire")
        distance =
          new SegmentShape(object.value).distance(point) -
          Math.max(object.value.width / 2, 0.5 / scale);
      else if (object.kind === "drawing") {
        if (entry.segment)
          distance =
            new SegmentShape(entry.segment).distance(point) -
            Math.max(entry.segment.width / 2, 0.5 / scale);
        else
          for (const stroke of entry.strokes ?? [])
            distance = Math.min(
              distance,
              new LineShape(stroke.a, stroke.b).distance(point) -
                Math.max(stroke.width / 2, 0.5 / scale),
            );
      } else if (object.kind === "zone") {
        const zone = object.value;
        if (display.shapes > 0 && new ZoneShape(zone).contains(point))
          distance = -1 / scale;
        else {
          distance = new ZoneShape(zone).boundaryDistance(
            point,
            tolerance + 0.65 / scale,
          );
          distance -= 0.65 / scale;
          hitCategory = "zone-outline";
        }
      } else if (
        entry.pad &&
        (object.kind === "via" ||
          object.kind === "finger" ||
          object.kind === "pin")
      ) {
        distance = new PadShapeGeometry(entry.pad).distance(
          point,
          object.value,
        );
        if (!display.filled) distance = Math.abs(distance) - 0.65 / scale;
      }
      if (distance <= tolerance)
        hits.push({
          object,
          layer,
          category: hitCategory,
          distance,
          sequence: entry.sequence,
        });
    }
    const exact = hits.filter((hit) => hit.distance <= 0),
      pool = exact.length ? exact : hits;
    const sorted = BoardDisplay.orderBatches(
      pool.sort((a, b) => a.sequence - b.sequence),
      display,
    );
    if (exact.length) return sorted.at(-1) ?? null;
    return sorted.reverse().sort((a, b) => a.distance - b.distance)[0] ?? null;
  }
  select(anchor: PickHit, mode: SelectionMode): Selection {
    if (mode === "net" && anchor.object.value.net)
      return {
        anchor,
        mode,
        objects: this.nets.get(anchor.object.value.net) ?? [anchor.object],
      };
    if (
      mode === "track" &&
      (anchor.object.kind === "segment" || anchor.object.kind === "bond-wire")
    )
      return {
        anchor,
        mode,
        objects: this.tracks.get(anchor.object.value.trackId) ?? [
          anchor.object,
        ],
      };
    const reference =
      anchor.object.kind === "pin"
        ? anchor.object.value.reference
        : anchor.object.kind === "finger"
          ? anchor.object.value.finger?.reference
          : undefined;
    if (mode === "component" && reference)
      return {
        anchor,
        mode,
        objects: this.components.get(reference) ?? [anchor.object],
      };
    return { anchor, mode: "object", objects: [anchor.object] };
  }
  find(item: SearchItem, display: DisplayOptions): Selection | null {
    const steps = this.locateSteps(item, display);
    let step = steps.next();
    while (!step.done) step = steps.next();
    return step.value.selection;
  }
  *locateSteps(
    item: SearchItem,
    display: DisplayOptions,
  ): Generator<void, { selection: Selection | null; bounds: Bounds | null }> {
    const objects =
      (item.kind === "net"
        ? this.nets.get(item.id)
        : this.components.get(item.id)) ?? [];
    const displayRank = BoardDisplay.createDisplayRank(display);
    const selectionBounds = emptyBounds();
    let lastEntry: Entry | undefined;
    let lastVisibleEntry: Entry | undefined;
    let lastRank: number[] | undefined;
    let lastVisibleRank: number[] | undefined;
    let work = 0;
    const isLaterInDisplayOrder = (
      candidate: number[],
      current: number[] | undefined,
    ) => {
      if (!current) return true;
      for (let i = 0; i < candidate.length; i++)
        if (candidate[i] !== current[i]) return candidate[i] > current[i];
      return true; // Last source entry wins, matching the stable draw order.
    };
    for (const object of objects)
      for (const entry of this.entriesByObject.get(object) ?? []) {
        const entryRank = displayRank(entry);
        if (isLaterInDisplayOrder(entryRank, lastRank)) {
          lastEntry = entry;
          lastRank = entryRank;
        }
        if (
          BoardDisplay.isBatchVisible(display, entry) &&
          isLaterInDisplayOrder(entryRank, lastVisibleRank)
        ) {
          lastVisibleEntry = entry;
          lastVisibleRank = entryRank;
        }
        include(selectionBounds, [entry.bounds.minX, entry.bounds.minY]);
        include(selectionBounds, [entry.bounds.maxX, entry.bounds.maxY]);
        if ((++work & 2047) === 0) yield;
      }
    const entry = lastVisibleEntry ?? lastEntry;
    const selection: Selection | null = entry
      ? {
          anchor: {
            object: entry.object,
            layer: entry.layer,
            category: entry.category,
            distance: 0,
          },
          mode: item.kind,
          objects,
        }
      : null;
    return {
      selection,
      bounds: Number.isFinite(selectionBounds.minX) ? selectionBounds : null,
    };
  }
  boundsFor(objects: BoardObject[]): Bounds | null {
    const bounds = emptyBounds();
    for (const object of objects)
      for (const entry of this.entriesByObject.get(object) ?? []) {
        include(bounds, [entry.bounds.minX, entry.bounds.minY]);
        include(bounds, [entry.bounds.maxX, entry.bounds.maxY]);
      }
    return Number.isFinite(bounds.minX) ? bounds : null;
  }
}

export function selectionScene(
  scene: BoardScene,
  objects: BoardObject[],
): BoardScene {
  const steps = selectionSceneSteps(scene, objects);
  let step = steps.next();
  while (!step.done) step = steps.next();
  return step.value;
}
export function* selectionSceneSteps(
  scene: BoardScene,
  objects: BoardObject[],
): Generator<void, BoardScene> {
  const result: BoardScene = {
    ...scene,
    segments: [],
    vias: [],
    pins: [],
    zones: [],
    texts: [],
    outline: [],
    drawings: [],
  };
  let work = 0;
  for (const object of objects) {
    if (object.kind === "segment" || object.kind === "bond-wire")
      result.segments.push(object.value);
    else if (object.kind === "via" || object.kind === "finger")
      result.vias.push(object.value);
    else if (object.kind === "pin") result.pins.push(object.value);
    else if (object.kind === "drawing") {
      result.drawings!.push(object.value);
      for (const text of object.value.texts) result.texts.push(text);
    } else result.zones.push(object.value);
    if ((++work & 2047) === 0) yield;
  }
  return result;
}
