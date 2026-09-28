import type { BoardText, DrawingLayer } from "../../board/model";
import type { Raw } from "../binary/reader";
import { isFontDefinitionTable } from "../binary/records/definitions";
import type { BrdDatabase } from "../database";
import { AllegroLayerDecoder } from "./layers";
import { AllegroTextRecordDecoder } from "./text-record";
import { parserError } from "../../parser-error";
export class AllegroTextBuilder {
  constructor(
    readonly database: BrdDatabase,
    readonly scale: number,
  ) {}
  async build(diagnostics: string[], signal?: AbortSignal) {
    const db = this.database;
    const scale = this.scale;
    const tables = [...db.records(0x36)].filter((r) => r.Code === 8);
    if (tables.length > 1)
      diagnostics.push("存在多组字体定义，使用第一组；需要核验字体索引");
    if (tables[0] && !isFontDefinitionTable(tables[0]))
      diagnostics.push("字体定义表字段无效");
    const fonts = isFontDefinitionTable(tables[0]) ? tables[0].Fonts : [];
    const wrappers = new Map<number, Raw>();
    const owners = new Map<number, number>();
    let deadline = performance.now() + 10;
    async function walk(head: number, tail: number, ownerId?: number) {
      const seen = new Set<number>();
      let key = head;
      while (key && key !== tail && !db.header.sentinelKeys?.includes(key)) {
        signal?.throwIfAborted();
        if (seen.has(key))
          throw parserError("brdTextChainLoop", { detail: key });
        seen.add(key);
        const record = db.get(key);
        if (!record) {
          diagnostics.push(`文字链缺失引用 ${key}`);
          break;
        }
        if (record.type === 0x30) {
          wrappers.set(key, record);
          if (ownerId !== undefined) owners.set(key, ownerId);
        } else if (record.type !== 3) {
          diagnostics.push(`文字链遇到非文字记录 ${key} / ${record.type}`);
          break;
        }
        key = record.Next;
        if (performance.now() > deadline) {
          await new Promise((r) => setTimeout(r, 0));
          deadline = performance.now() + 10;
        }
      }
    }
    // Only placed objects: do not render uninstantiated library text at its local origin.
    await walk(db.header.textList.head, db.header.textList.tail);
    for (const fp of db.records(0x2d)) await walk(fp.TextPtr, fp.Key, fp.Key);
    const texts: BoardText[] = [],
      drawingLayers = new Map<number, DrawingLayer>();
    const decoder = new AllegroTextRecordDecoder(scale);
    for (const wrapper of wrappers.values()) {
      const graphic = db.get(wrapper.StrGraphicPtr),
        props = wrapper.Font ?? wrapper.Font16x,
        font = fonts[(props & 255) - 1];
      if (graphic?.type !== 0x31) {
        diagnostics.push(`文字 ${wrapper.Key} 缺少内容记录`);
        continue;
      }
      const zeroSize =
        font &&
        [
          font.Height,
          font.Width,
          font.CharacterSpace,
          font.LineSpace,
          font.StrokeWidth,
        ].every((value) => value === 0);
      if (!font || (!zeroSize && (font.Height <= 0 || font.Width <= 0))) {
        diagnostics.push(
          `文字 ${wrapper.Key} 的字体 ${props & 255} 无有效尺寸`,
        );
        continue;
      }
      if ((wrapper.Layer & 255) === 5) continue; // DRC is outside the viewer scope.
      const text = decoder.decode(wrapper, graphic, font);
      if (owners.has(wrapper.Key)) text.ownerId = owners.get(wrapper.Key);
      texts.push(text);
      if (text.classId !== 6 && !drawingLayers.has(text.layer)) {
        const definition = db.get(
            db.header.layerMap?.[text.classId]?.recordId ?? 0,
          ),
          entry = definition?.Entries?.[text.subclass];
        const customName = entry?.Name ?? db.strings?.get(entry?.NameId);
        const layer = AllegroLayerDecoder.drawingLayer(
          wrapper.Layer,
          customName,
        );
        drawingLayers.set(layer.id, layer);
      }
      if (performance.now() > deadline) {
        signal?.throwIfAborted();
        await new Promise((r) => setTimeout(r, 0));
        deadline = performance.now() + 10;
      }
    }
    signal?.throwIfAborted();
    return {
      texts,
      drawingLayers: [...drawingLayers.values()].sort(
        (a, b) =>
          Number(b.defaultVisible) - Number(a.defaultVisible) || a.id - b.id,
      ),
    };
  }
}
