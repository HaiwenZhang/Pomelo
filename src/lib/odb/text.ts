/** Iterate without allocating an array containing every line of a large layer. */
export function* lines(text: string) {
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf("\n", start);
    if (end < 0) end = text.length;
    const line = text.slice(start, end).trim();
    start = end + 1;
    if (line && !line.startsWith("#")) yield line;
  }
}
export function fields(text: string) {
  const result: Record<string, string> = {};
  for (const line of lines(text)) {
    const at = line.indexOf("=");
    if (at > 0) result[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return result;
}
export function blocks(text: string, kind: string) {
  return [
    ...text.matchAll(new RegExp(`^\\s*${kind}\\s*\\{([^}]+)\\}`, "gm")),
  ].map((m) => fields(m[1]));
}
export function number(token: string | undefined, context = "number") {
  if (token === undefined || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(token))
    throw new Error(`ODB++ ${context} 数值无效：${token}`);
  const value = Number(token);
  if (!Number.isFinite(value)) throw new Error(`ODB++ ${context} 超出数值范围`);
  return value;
}
export function unitScale(unit: string) {
  if (unit === "MM") return 1;
  if (unit === "INCH") return 25.4;
  throw new Error(`ODB++ 不支持的单位：${unit}`);
}
