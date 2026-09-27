import type { Point, Segment } from "../board/model";
import { SegmentShape } from "../board/shapes/segment";
import { cooperative } from "../cooperative";
import { lines, number, unitScale } from "./text";
export interface OdbSymbol {
  name: string;
  scale: number;
}
export interface OdbContour {
  kind: "I" | "H";
  path: Segment[];
}
interface Base {
  index: number;
  uid?: string;
  attributes: Map<string, string>;
}
export type OdbFeature = Base &
  (
    | {
        kind: "line";
        segment: Segment;
        symbol: OdbSymbol;
      }
    | {
        kind: "pad";
        at: Point;
        angle: number;
        mirror: boolean;
        symbol: OdbSymbol;
      }
    | {
        kind: "surface";
        contours: OdbContour[];
      }
  );
export function orientation(code: number, rotation = 0) {
  if (!Number.isInteger(code) || code < 0 || code > 9)
    throw new Error(`ODB++ 焊盘方向无效：${code}`);
  const mirror = (code >= 4 && code <= 7) || code === 9;
  const degrees = code < 8 ? (code % 4) * 90 : rotation;
  // ODB: clockwise, then mirror X. Renderer: mirror local Y, then CCW.
  return {
    angle: ((mirror ? degrees + 180 : -degrees) * Math.PI) / 180,
    mirror,
  };
}
export function odbSegment(
  a: Point,
  b: Point,
  width = 0,
  center?: Point,
  clockwise = false,
): Segment {
  return SegmentShape.fromPoints(a, b, width, center, clockwise);
}
/** Synchronous records with bounded checkpoints, including inside large surfaces.
 * Undefined means the consumer must check cancellation and yield if needed.
 * The sequence index counts features, never OB/OS/OC records or unique IDs. */
export class OdbFeatureReader {
  constructor(
    private readonly text: string,
    private readonly defaultUnits: string,
  ) {}
  *steps(signal?: AbortSignal): Generator<OdbFeature | undefined> {
    const { text, defaultUnits } = this;
    let scale = unitScale(defaultUnits),
      index = 0,
      count = 0;
    const symbols = new Map<number, OdbSymbol>(),
      names = new Map<number, string>(),
      values = new Map<number, string>();
    let surface:
        | (Base & {
            kind: "surface";
            contours: OdbContour[];
          })
        | undefined,
      contour: OdbContour | undefined,
      previous: Point | undefined,
      first: Point | undefined;
    let t: string[] = [];
    const pt = (i: number): Point => [
      number(t[i]) * scale,
      number(t[i + 1]) * scale,
    ];
    const symbol = (i: number) => {
      const s = symbols.get(number(t[i]));
      if (!s) throw new Error(`ODB++ 未定义符号 ${t[i]}`);
      return s;
    };
    const positive = (i: number) => {
      if (t[i] !== "P")
        throw new Error(`ODB++ 暂不支持负极性图元 ${index - 1}`);
    };
    for (const line of lines(text)) {
      if ((++count & 511) === 0) {
        signal?.throwIfAborted();
        yield undefined;
      }
      if (line.startsWith("UNITS=")) {
        scale = unitScale(line.slice(6));
        continue;
      }
      if (/^U\s+(MM|INCH)$/.test(line)) {
        scale = unitScale(line.slice(2).trim());
        continue;
      }
      if (line.startsWith("ID=")) continue;
      if (line[0] === "$") {
        const t = line.split(/\s+/);
        symbols.set(number(t[0].slice(1)), {
          name: t[1],
          scale: (t[2] === "M" ? 1 : t[2] === "I" ? 25.4 : scale) / 1000,
        });
        continue;
      }
      if (line[0] === "@" || line[0] === "&") {
        const match = /^[@&](\d+)(?:\s+(.*))?$/.exec(line);
        if (!match) throw new Error(`ODB++ 属性字典无效：${line}`);
        (line[0] === "@" ? names : values).set(
          number(match[1]),
          match[2] ?? "",
        );
        continue;
      }
      const [command, attrs = "", extra = ""] = line.split(";");
      t = command.trim().split(/\s+/);
      const tag = t[0];
      if (tag === "F") continue; // advisory count; several exporters count custom symbols incorrectly
      if (tag === "OB") {
        if (!surface || contour || !["I", "H"].includes(t[3]))
          throw new Error("ODB++ 无效 OB 轮廓");
        first = previous = pt(1);
        contour = { kind: t[3] as "I" | "H", path: [] };
        continue;
      }
      if (tag === "OS" || tag === "OC") {
        if (!contour || !previous) throw new Error("ODB++ 轮廓边缺少 OB");
        const next = pt(1);
        if (tag === "OC" && !["Y", "N"].includes(t[5]))
          throw new Error("ODB++ OC 方向无效");
        if (tag === "OC" || next[0] !== previous[0] || next[1] !== previous[1])
          contour.path.push(
            odbSegment(
              previous,
              next,
              0,
              tag === "OC" ? pt(3) : undefined,
              t[5] === "Y",
            ),
          );
        previous = next;
        continue;
      }
      if (tag === "OE") {
        if (!contour || !surface || !first || !previous)
          throw new Error("ODB++ OE 缺少 OB");
        if (Math.hypot(first[0] - previous[0], first[1] - previous[1]) > 1e-7)
          throw new Error("ODB++ 轮廓没有闭合");
        surface.contours.push(contour);
        contour = undefined;
        continue;
      }
      if (tag === "SE") {
        if (!surface || contour) throw new Error("ODB++ SE 不完整");
        yield surface;
        surface = undefined;
        continue;
      }
      if (surface) throw new Error("ODB++ 面域缺少 SE");
      const attributes = new Map<string, string>();
      for (const pair of attrs.split(",")) {
        if (!pair.trim()) continue;
        const [key, value = "true"] = pair.trim().split("=");
        if (key === "ID") continue;
        const name = names.get(number(key));
        if (name)
          attributes.set(
            name,
            name === ".geometry" ? (values.get(Number(value)) ?? value) : value,
          );
      }
      const base: Base = {
        index: index++,
        attributes,
        uid: /(?:^|;)ID=([^;]+)/.exec(";" + attrs + ";" + extra)?.[1],
      };
      if (tag === "S") {
        positive(1);
        surface = { ...base, kind: "surface", contours: [] };
      } else if (tag === "L" || tag === "A") {
        positive(tag === "L" ? 6 : 8);
        if (tag === "A" && !["Y", "N"].includes(t[10]))
          throw new Error("ODB++ 圆弧方向无效");
        yield {
          ...base,
          kind: "line",
          symbol: symbol(tag === "L" ? 5 : 7),
          segment: odbSegment(
            pt(1),
            pt(3),
            0,
            tag === "A" ? pt(5) : undefined,
            t[10] === "Y",
          ),
        };
      } else if (tag === "P") {
        if (t[3] === "-1") throw new Error("ODB++ 暂不支持 resize 焊盘");
        positive(4);
        const code = number(t[6]);
        yield {
          ...base,
          kind: "pad",
          at: pt(1),
          symbol: symbol(3),
          ...orientation(code, code >= 8 ? number(t[7]) : 0),
        };
      } else throw new Error(`ODB++ 未支持的图元：${tag}`);
    }
    signal?.throwIfAborted();
    if (surface || contour) throw new Error("ODB++ 面域文件截断");
  }
  async *read(signal?: AbortSignal): AsyncGenerator<OdbFeature> {
    const pause = cooperative(signal);
    for (const feature of this.steps(signal)) {
      if (feature) yield feature;
      else {
        const pending = pause();
        if (pending) await pending;
      }
    }
  }
}
/** Compatibility entry point; parsing state belongs to OdbFeatureReader. */
export function* readFeatureSteps(
  text: string,
  defaultUnits: string,
  signal?: AbortSignal,
): Generator<OdbFeature | undefined> {
  yield* new OdbFeatureReader(text, defaultUnits).steps(signal);
}
/** Async convenience adapter for individual symbols and external callers. */
export async function* readFeatures(
  text: string,
  defaultUnits: string,
  signal?: AbortSignal,
): AsyncGenerator<OdbFeature> {
  yield* new OdbFeatureReader(text, defaultUnits).read(signal);
}
