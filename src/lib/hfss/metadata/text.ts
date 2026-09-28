import { parserError } from "../../parser-error";

export interface DefCall {
  name: string;
  args: {
    key?: string;
    value: DefTextValue;
  }[];
}
export type DefTextValue = string | number | boolean | DefCall;
export interface DefBlock {
  name: string;
  properties: Map<string, DefTextValue>;
  calls: DefCall[];
  children: DefBlock[];
}
/** Parse the embedded AEDT property grammar without evaluating expressions. */
export class DefStatementReader {
  constructor(private readonly text: string) {}
  read(): {
    key?: string;
    value: DefTextValue;
  } {
    const { text } = this;
    let at = 0;
    const error = (): never => {
      throw parserError("hfssInvalidPropertySyntax", {
        detail: text.slice(Math.max(0, at - 24), at + 64),
      });
    };
    const whitespace = () => {
      while (at < text.length && /\s/.test(text[at])) at++;
    };
    function token(): {
      text: string;
      quoted: boolean;
    } {
      whitespace();
      if (at >= text.length) return error();
      if (text[at] === "'") {
        at++;
        let result = "";
        while (at < text.length) {
          const ch = text[at++];
          if (ch === "'") return { text: result, quoted: true };
          if (ch === "\\") {
            if (at >= text.length) return error();
            const next = text[at++];
            result +=
              next === "n"
                ? "\n"
                : next === "r"
                  ? "\r"
                  : next === "t"
                    ? "\t"
                    : next;
          } else result += ch;
        }
        return error();
      }
      const start = at;
      while (at < text.length && !/[\s=(),]/.test(text[at])) at++;
      if (start === at) return error();
      return { text: text.slice(start, at), quoted: false };
    }
    function value(first = token(), depth = 0): DefTextValue {
      if (depth > 64) return error();
      whitespace();
      if (!first.quoted && text[at] === "(") {
        at++;
        const args: DefCall["args"] = [];
        whitespace();
        while (text[at] !== ")") {
          if (at >= text.length) return error();
          const next = token();
          whitespace();
          if (text[at] === "=") {
            at++;
            args.push({ key: next.text, value: value(token(), depth + 1) });
          } else args.push({ value: value(next, depth + 1) });
          whitespace();
          if (text[at] === ",") {
            at++;
            whitespace();
          } else if (text[at] !== ")") return error();
        }
        at++;
        return { name: first.text, args };
      }
      if (first.quoted) return first.text;
      if (first.text === "true" || first.text === "false")
        return first.text === "true";
      if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(first.text)) {
        const n = Number(first.text);
        if (!Number.isFinite(n)) return error();
        return n;
      }
      return first.text;
    }
    const first = token();
    whitespace();
    let result: ReturnType<typeof parseDefStatement>;
    if (text[at] === "=") {
      at++;
      result = { key: first.text, value: value() };
    } else result = { value: value(first) };
    whitespace();
    if (at !== text.length) return error();
    return result;
  }
}
/** Compatibility entry point; parsing state belongs to DefStatementReader. */
export function parseDefStatement(text: string): {
  key?: string;
  value: DefTextValue;
} {
  return new DefStatementReader(text).read();
}
export class DefTextReader {
  constructor(private readonly text: string) {}
  read(): DefBlock {
    const { text } = this;
    const container: DefBlock = {
        name: "",
        properties: new Map(),
        calls: [],
        children: [],
      },
      stack = [container];
    let lineNumber = 0;
    for (const line of statements(text)) {
      lineNumber++;
      if (!line) continue;
      const directive = /^\$(begin|end)\s+(.+)$/.exec(line);
      if (directive) {
        const name = new DefStatementReader(directive[2]).read().value;
        if (typeof name !== "string")
          throw parserError("hfssInvalidBlockName", { detail: lineNumber });
        if (directive[1] === "begin") {
          if (stack.length > 64)
            throw parserError("hfssPropertyNestingTooDeep");
          const block: DefBlock = {
            name,
            properties: new Map(),
            calls: [],
            children: [],
          };
          stack.at(-1)!.children.push(block);
          stack.push(block);
        } else if (stack.length === 1 || stack.pop()!.name !== name)
          throw parserError("hfssMismatchedPropertyBlock", {
            detail: lineNumber,
          });
        continue;
      }
      const current = stack.at(-1)!,
        counted = /^([A-Za-z_][A-Za-z_0-9]*)\[(\d+):\s*(.*)\]$/.exec(line),
        statement = new DefStatementReader(
          counted ? `${counted[1]}(${counted[3]})` : line,
        ).read();
      if (counted) {
        if (
          typeof statement.value !== "object" ||
          statement.value.args.length !== Number(counted[2])
        )
          throw parserError("hfssCountMismatch", {
            detail: counted[1],
            value: lineNumber,
          });
      }
      if (statement.key !== undefined) {
        if (current.properties.has(statement.key))
          throw parserError("hfssDuplicateProperty", { detail: statement.key });
        current.properties.set(statement.key, statement.value);
      } else if (typeof statement.value === "object")
        current.calls.push(statement.value);
      else throw parserError("hfssUnknownPropertyLine", { detail: lineNumber });
    }
    if (stack.length !== 1) throw parserError("hfssTruncatedPropertyBlock");
    return container.children.length === 1 &&
      !container.calls.length &&
      !container.properties.size
      ? container.children[0]
      : container;
  }
}
/** Compatibility entry point; parsing state belongs to DefTextReader. */
export function parseDefText(text: string): DefBlock {
  return new DefTextReader(text).read();
}
function* statements(text: string) {
  let start = 0,
    quote = false,
    escaped = false,
    depth = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === "'") quote = false;
    } else if (ch === "'") quote = true;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      if (--depth < 0) throw parserError("hfssUnbalancedPropertyParentheses");
    } else if (ch === "\n" && depth === 0) {
      yield text.slice(start, i).trim();
      start = i + 1;
    }
  }
  if (quote || depth) throw parserError("hfssTruncatedPropertyText");
  if (start < text.length) yield text.slice(start).trim();
}
export function argument(call: DefCall, key: string) {
  return call.args.find((a) => a.key === key)?.value;
}
export function child(block: DefBlock, name: string) {
  return block.children.find((b) => b.name === name);
}
