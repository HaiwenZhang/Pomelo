import { PCB_NET_COLORS } from "./pcb-net-colors";

export type ColorMode = "layer" | "net";
const netColors = PCB_NET_COLORS.map((argb) => [
  ((argb >>> 16) & 255) / 255,
  ((argb >>> 8) & 255) / 255,
  (argb & 255) / 255,
]);

/** Unassigned objects retain their layer color; assigned nets use the shared palette. */
export function copperColor(
  layerColor: number[],
  net: number,
  mode: ColorMode,
): number[] {
  if (mode === "layer" || !Number.isInteger(net) || net <= 0) return layerColor;
  return netColors[net % netColors.length];
}
