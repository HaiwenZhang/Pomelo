import type { PadsContainer } from "./container";
import { PADS_BASIC_TO_MM, type PadsLayer } from "./metadata";
import { cooperative } from "../../cooperative";
export interface PadsRoute {
  object: number;
  handle: number;
  layer: number;
  net: number;
  width: number;
  style: number;
  points: Array<[number, number]>;
}
export class PadsRouteReader {
  constructor(
    private readonly container: PadsContainer,
    private readonly layers: PadsLayer[],
    private readonly junctionHandles: {
      handle: number;
      net: number;
    }[],
  ) {}
  async read(signal?: AbortSignal) {
    const { container, layers, junctionHandles } = this;
    const { view, sections } = container,
      pause = cooperative(signal);
    signal?.throwIfAborted();
    const readUint32 = (at: number) => {
      if (at < 0 || at > view.byteLength - 4)
        throw new Error(`PADS 走线字段越界 ${at}`);
      return view.getUint32(at, true);
    };
    const readInt32 = (at: number) => readUint32(at) | 0;
    const readLowUint16 = (at: number) => readUint32(at) & 65535;
    const objects = sections[62],
      layerSection = sections[63],
      cells = sections[64],
      nodes = sections[61],
      descriptors = sections[26],
      controller = sections[25];
    if (
      !layerSection.count ||
      layerSection.declaredBytes !== layerSection.count * 2 ||
      cells.declaredBytes !== cells.count * 12
    )
      throw new Error("PADS 走线层/坐标记录尺寸无效");
    if (!objects.count) {
      if (objects.declaredBytes || cells.count)
        throw new Error("PADS 空走线对象与坐标不符");
      return { routes: [], auxiliary: 0, objects: 0, cells: 0 };
    }
    const stride = objects.declaredBytes / objects.count;
    if (![36, 48].includes(stride) || nodes.declaredBytes !== nodes.count * 12)
      throw new Error("PADS 走线/节点记录尺寸无效");
    const permutation = Array.from({ length: layerSection.count }, (_, n) =>
      readLowUint16(layerSection.offset + n * 2),
    );
    if (
      new Set(permutation).size !== layerSection.count ||
      permutation.some((n) => n >= layerSection.count)
    )
      throw new Error("PADS 走线层排列无效");
    const groups = Array.from({ length: 4 }, (_, n) =>
        readLowUint16(controller.offset + 180 + n * 2),
      ),
      first = groups[0] + groups[1] + groups[2],
      pages = groups[3];
    if (!pages || first + pages > descriptors.count)
      throw new Error("PADS 走线节点页组无效");
    const handles: number[] = [];
    for (let page = 0; page < pages; page++) {
      const at = descriptors.offset + (first + page) * 12,
        base = readUint32(at),
        start = readUint32(at + 8),
        next = page + 1 < pages ? readUint32(at + 20) : nodes.count;
      // The descriptor's third word is the page's first allocator ordinal, not
      // the preceding page's live count. An allocated tail page may be unused.
      // DS113 has 13547 serialized rows, with an unused page starting at 13560.
      if (
        Math.min(start, nodes.count) !== handles.length ||
        (page + 1 < pages && next < start)
      )
        throw new Error("PADS 走线节点页序号无效");
      const count = Math.max(0, Math.min(next, nodes.count) - start);
      if (count > nodes.count - handles.length)
        throw new Error("PADS 走线节点页数量无效");
      for (let j = 0; j < count; j++) {
        const handle = base + j * 56;
        if (handle > 0xffffffff) throw new Error("PADS 节点句柄溢出");
        handles.push(handle);
      }
    }
    const ordinals = new Map(handles.map((handle, index) => [handle, index]));
    if (handles.length !== nodes.count || ordinals.size !== handles.length)
      throw new Error("PADS 走线节点页覆盖无效");
    const reverse = handles.map(() => [] as number[]),
      evidence = new Map<number, Set<number>>();
    for (const { handle, net } of junctionHandles) {
      const set = evidence.get(handle) ?? new Set<number>();
      set.add(net);
      evidence.set(handle, set);
    }
    for (let index = 0; index < handles.length; index++)
      for (const field of [0, 4]) {
        const target = ordinals.get(
          readUint32(nodes.offset + index * 12 + field),
        );
        if (target !== undefined) reverse[target].push(index);
      }
    const objectLayers: number[] = [],
      objectHandles: number[] = [],
      handleLayers = new Map<number, number>();
    let cursor = 0;
    if (sections[27].count !== layerSection.count)
      throw new Error("PADS 走线层对象计数不符");
    for (let layer = 0; layer < layerSection.count; layer++) {
      const count = readUint32(sections[27].offset + layer * 4);
      if (count > sections[29].count - cursor)
        throw new Error("PADS 层节点引用越界");
      for (let j = 0; j < count; j++, cursor++) {
        const handle = readUint32(sections[29].offset + cursor * 4);
        if (!handle) continue;
        const physicalLayer = permutation[layer] + 1,
          previous = handleLayers.get(handle),
          ordinal = ordinals.get(handle);
        if (previous !== undefined && previous !== physicalLayer)
          throw new Error("PADS 节点层冲突");
        handleLayers.set(handle, physicalLayer);
        if (ordinal === undefined) throw new Error("PADS 走线节点句柄缺失");
        if (readUint32(nodes.offset + ordinal * 12 + 8) & 0x800000) {
          objectLayers.push(physicalLayer);
          objectHandles.push(handle);
        }
      }
    }
    if (cursor !== sections[29].count || objectLayers.length !== objects.count)
      throw new Error("PADS 走线对象节点关联不完整");
    const readWrappedUint32 = (offset: number) => {
      let value = 0;
      for (let byte = 0; byte < 4; byte++)
        value |=
          view.getUint8(objects.offset + ((offset + byte) % objects.bytes)) <<
          (byte * 8);
      return value >>> 0;
    };
    const routes: PadsRoute[] = [],
      stamps = new Int32Array(handles.length).fill(-1);
    let cellCursor = 0,
      auxiliary = 0;
    for (let sequence = 0; sequence < objects.count; sequence++) {
      const pending = pause();
      if (pending) await pending;
      const object = (sequence + objects.count - 1) % objects.count;
      const at = 32 + object * stride,
        old = stride === 36;
      const width = (readWrappedUint32(at + (old ? 8 : 20)) | 0) * 4;
      const style = readWrappedUint32(at + (old ? 20 : 32));
      const count = readWrappedUint32(at + (old ? 24 : 36));
      if (count > cells.count - cellCursor)
        throw new Error("PADS 走线坐标分配越界");
      const begin = cellCursor;
      cellCursor += count;
      if (width <= 0 || style & 0x1100) {
        auxiliary++;
        continue;
      }
      const layer = objectLayers[sequence],
        handle = objectHandles[sequence],
        info = layers[layer];
      if (!info || info.direction < 0 || info.direction > 4)
        throw new Error("PADS 走线层方向无效");
      const root = ordinals.get(handle);
      if (root === undefined)
        throw new Error(`PADS 走线对象节点句柄缺失 ${handle}`);
      const found = new Set<number>();
      let frontier = [root];
      stamps[root] = sequence;
      while (frontier.length && !found.size) {
        const next: number[] = [];
        for (const ordinal of frontier) {
          for (const net of evidence.get(handles[ordinal]) ?? [])
            found.add(net);
          for (const linked of reverse[ordinal])
            if (stamps[linked] !== sequence) {
              stamps[linked] = sequence;
              next.push(linked);
            }
        }
        frontier = next;
        const pending = pause();
        if (pending) await pending;
      }
      const points: Array<[number, number]> = [];
      const appendPoint = (point: [number, number]) => {
        const last = points.at(-1);
        if (!last || last[0] !== point[0] || last[1] !== point[1])
          points.push(point);
      };
      for (let j = 0; j < count; j++) {
        if (j % 512 === 0) {
          const pending = pause();
          if (pending) await pending;
        }
        const at = cells.offset + (begin + j) * 12;
        const firstCoordinate = readInt32(at),
          secondCoordinate = readInt32(at + 4),
          lastCoordinate = readInt32(at + 8);
        const start: [number, number] =
          info.direction === 1
            ? [firstCoordinate, secondCoordinate]
            : [secondCoordinate, firstCoordinate];
        const end: [number, number] =
          info.direction === 1
            ? [lastCoordinate, secondCoordinate]
            : [secondCoordinate, lastCoordinate];
        appendPoint(start);
        appendPoint(end);
      }
      if (points.length < 2) continue;
      if (found.size !== 1)
        throw new Error(
          `PADS 走线网络证据不唯一 object=${object} handle=${handle} nets=${[...found]}`,
        );
      routes.push({
        object,
        handle,
        layer,
        net: [...found][0],
        width: width * PADS_BASIC_TO_MM,
        style,
        points: points.map(([x, y]) => [
          x * PADS_BASIC_TO_MM,
          y * PADS_BASIC_TO_MM,
        ]),
      });
    }
    if (cellCursor !== cells.count) throw new Error("PADS 走线坐标未完整消费");
    return { routes, auxiliary, objects: objects.count, cells: cells.count };
  }
}
/** Compatibility entry point; parsing state belongs to PadsRouteReader. */
export async function readPadsRoutes(
  container: PadsContainer,
  layers: PadsLayer[],
  junctionHandles: {
    handle: number;
    net: number;
  }[],
  signal?: AbortSignal,
) {
  return new PadsRouteReader(container, layers, junctionHandles).read(signal);
}
