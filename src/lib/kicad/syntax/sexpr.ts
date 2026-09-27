import type { KiCadSpan } from "./index";
export type KiCadValue = string | KiCadExpression;
export interface KiCadExpression {
  head: string;
  values: KiCadValue[];
}
const space = (value: string) =>
  value === " " || value === "\t" || value === "\r" || value === "\n";
/** Decode independent spans with a shared decoder, without retaining a whole-board AST. */
export class KiCadExpressionReader {
  private readonly decoder = new TextDecoder("utf-8", { fatal: true });
  constructor(private readonly bytes: Uint8Array) {}
  read(span: KiCadSpan): KiCadExpression {
    if (
      span.start < 0 ||
      span.end > this.bytes.length ||
      span.start >= span.end
    )
      throw new Error("KiCad 对象范围无效");
    const source = this.decoder.decode(
      this.bytes.subarray(span.start, span.end),
    );
    return new KiCadExpressionParser(source, span.start).read();
  }
}
/** A cursor belongs to one expression, including all its recursive children. */
class KiCadExpressionParser {
  private at = 0;
  constructor(
    private readonly source: string,
    private readonly byteOffset: number,
  ) {}
  read(): KiCadExpression {
    const result = this.expression();
    this.skip();
    if (this.at !== this.source.length)
      throw new Error("KiCad 对象后含多余数据");
    return result;
  }
  private skip() {
    while (this.at < this.source.length) {
      const ch = this.source[this.at];
      if (space(ch)) {
        this.at++;
        continue;
      }
      if (ch === "#" || ch === ";") {
        const end = this.source.indexOf("\n", this.at);
        this.at = end < 0 ? this.source.length : end;
        continue;
      }
      break;
    }
  }
  private atom(): string {
    if (this.source[this.at] === '"') {
      let begin = ++this.at,
        value = "";
      while (this.at < this.source.length) {
        const ch = this.source[this.at++];
        if (ch === '"') return value + this.source.slice(begin, this.at - 1);
        if (ch === "\\") {
          value += this.source.slice(begin, this.at - 1);
          if (this.at >= this.source.length)
            throw new Error("KiCad 字符串转义截断");
          const next = this.source[this.at++];
          value +=
            next === "n"
              ? "\n"
              : next === "r"
                ? "\r"
                : next === "t"
                  ? "\t"
                  : next;
          begin = this.at;
        }
      }
      throw new Error("KiCad 字符串未闭合");
    }
    const begin = this.at;
    while (
      this.at < this.source.length &&
      !space(this.source[this.at]) &&
      this.source[this.at] !== ")" &&
      this.source[this.at] !== "("
    )
      this.at++;
    if (begin === this.at)
      throw new Error(`KiCad 对象缺少原子值 @${this.byteOffset + this.at}`);
    return this.source.slice(begin, this.at);
  }
  private expression(): KiCadExpression {
    this.skip();
    if (this.source[this.at++] !== "(") throw new Error("KiCad 对象缺少左括号");
    this.skip();
    const head = this.atom(),
      values: KiCadValue[] = [];
    while (true) {
      this.skip();
      if (this.at >= this.source.length) throw new Error("KiCad 对象未闭合");
      if (this.source[this.at] === ")") {
        this.at++;
        break;
      }
      values.push(
        this.source[this.at] === "(" ? this.expression() : this.atom(),
      );
    }
    return { head, values };
  }
}
/** Compatibility entry point for a standalone indexed expression. */
export function parseKiCadExpression(
  bytes: Uint8Array,
  span: KiCadSpan,
): KiCadExpression {
  return new KiCadExpressionReader(bytes).read(span);
}
export const kiCadChildren = (node: KiCadExpression, head: string) =>
  node.values.filter(
    (value): value is KiCadExpression =>
      typeof value !== "string" && value.head === head,
  );
export const kiCadChild = (node: KiCadExpression, head: string) =>
  node.values.find(
    (value): value is KiCadExpression =>
      typeof value !== "string" && value.head === head,
  );
export const kiCadAtom = (node: KiCadExpression, index = 0) => {
  const value = node.values[index];
  if (typeof value !== "string")
    throw new Error(`KiCad ${node.head} 参数 ${index} 不是原子值`);
  return value;
};
export const kiCadNumber = (node: KiCadExpression, index = 0) => {
  const value = Number(kiCadAtom(node, index));
  if (!Number.isFinite(value))
    throw new Error(`KiCad ${node.head} 参数 ${index} 不是有限数字`);
  return value;
};
