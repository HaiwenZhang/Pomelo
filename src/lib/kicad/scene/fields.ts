import type { Point } from "../../board/model";
import { kiCadChild, kiCadNumber, type KiCadExpression } from "../syntax/sexpr";

export function kiCadRequired(
  node: KiCadExpression,
  name: string,
): KiCadExpression {
  const child = kiCadChild(node, name);
  if (!child) throw new Error(`KiCad ${node.head} 缺少 ${name}`);
  return child;
}

export function kiCadPosition(node: KiCadExpression): Point {
  return [kiCadNumber(node, 0), -kiCadNumber(node, 1)];
}

export function kiCadNumberOr(
  node: KiCadExpression,
  index: number,
  otherwise = 0,
): number {
  return node.values.length > index ? kiCadNumber(node, index) : otherwise;
}
