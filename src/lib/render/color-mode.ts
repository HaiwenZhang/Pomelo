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

/** Dynamic copper keeps net RGB and packs its layer RGB into the otherwise
 * constant alpha lane. All 24-bit RGB values plus one are exact float32 integers.
 * Negative alpha distinguishes material data from ordinary RGBA (text/drills).
 * The vertex shader restores alpha=1 before interpolation/blending. */
export function copperMaterial(
  layerColor: number[],
  net: number,
  mode: ColorMode | "dynamic",
): number[] {
  if (mode !== "dynamic") return [...copperColor(layerColor, net, mode), 1];
  const packed =
    (Math.round(layerColor[0] * 255) << 16) |
    (Math.round(layerColor[1] * 255) << 8) |
    Math.round(layerColor[2] * 255);
  return [...copperColor(layerColor, net, "net"), -(packed + 1)];
}
