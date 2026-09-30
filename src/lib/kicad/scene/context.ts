import type { Layer } from "../../board/model";
import { ParserError } from "../../parser-error";
import { cooperative } from "../../cooperative";
import type { KiCadBoardIndex } from "../syntax/index";
import {
  kiCadAtom,
  kiCadChild,
  kiCadNumber,
  KiCadExpressionReader,
  type KiCadExpression,
} from "../syntax/sexpr";

const colors = [
  "#58b5ed",
  "#83ce94",
  "#edb963",
  "#ba8bec",
  "#eb819d",
  "#54c7bd",
];

/** Layer and net identity belongs to an import, shared by tracks, pads and fills. */
export class KiCadSceneContext {
  readonly layerIds: Map<string, number>;
  private readonly netNames = new Map<string, number>();
  private nextNet = 1;

  constructor(
    readonly layers: Layer[],
    readonly nets: Map<number, string>,
  ) {
    this.layerIds = new Map(layers.map((layer) => [layer.name, layer.id]));
    for (const [id, name] of nets) {
      this.netNames.set(name, id);
      this.nextNet = Math.max(this.nextNet, id + 1);
    }
  }

  net(node: KiCadExpression): number {
    const field = kiCadChild(node, "net");
    if (!field) return 0;
    const value = kiCadAtom(field);
    if (/^\d+$/.test(value)) {
      const id = Number(value);
      if (!Number.isSafeInteger(id) || (id !== 0 && !this.nets.has(id)))
        throw new ParserError(
          "kicadUnknownObjectNet",
          { detail: node.head, value },
          `KiCad ${node.head} 引用未知网络 ${value}`,
        );
      return id;
    }
    if (!value) return 0;
    let id = this.netNames.get(value);
    if (id === undefined) {
      id = this.nextNet++;
      this.nets.set(id, value);
      this.netNames.set(value, id);
    }
    return id;
  }

  static async read(
    index: KiCadBoardIndex,
    signal?: AbortSignal,
  ): Promise<KiCadSceneContext> {
    signal?.throwIfAborted();
    const expressions = new KiCadExpressionReader(index.bytes);
    const layerSpans = index.items.get("layers");
    if (layerSpans?.length !== 1) throw new Error("KiCad 层表缺失或重复");
    const layers: Layer[] = [],
      names = new Set<string>();
    for (const value of expressions.read(layerSpans[0]).values) {
      if (typeof value === "string") continue;
      const name = kiCadAtom(value, 0);
      if (!name.endsWith(".Cu")) continue;
      if (names.has(name)) throw new Error(`KiCad 重复铜层 ${name}`);
      names.add(name);
      const id = layers.length;
      layers.push({
        id,
        name,
        color: colors[id % colors.length],
        layerFunction: "conductor",
      });
    }
    if (layers.length < 2) throw new Error("KiCad 缺少至少两个铜层");
    const nets = new Map<number, string>(),
      seen = new Set<number>(),
      pause = cooperative(signal);
    for (const span of index.items.get("net") ?? []) {
      const pending = pause();
      if (pending) await pending;
      const node = expressions.read(span),
        id = kiCadNumber(node, 0),
        name = kiCadAtom(node, 1);
      if (!Number.isSafeInteger(id) || id < 0 || seen.has(id))
        throw new Error(`KiCad 网络编号无效 ${id}`);
      seen.add(id);
      if (id !== 0) nets.set(id, name);
    }
    return new KiCadSceneContext(layers, nets);
  }
}
