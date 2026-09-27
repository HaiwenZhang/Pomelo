import type { DrillShape } from "../../board/model";
function padDimensions(value: unknown): value is { W: number; H: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "W" in value &&
    typeof value.W === "number" &&
    "H" in value &&
    typeof value.H === "number"
  );
}
export class AllegroDrillDecoder {
  constructor(readonly scale: number) {}
  decode(stack: {
    DrillSize: number;
    SlotX: number;
    SlotY: number;
    Flags: number;
    Plated?: boolean;
    NumFixedCompEntries?: number;
    Components: ReadonlyArray<unknown>;
  }): DrillShape {
    const scale = this.scale;
    let width = stack.SlotY > 0 ? stack.SlotX : stack.DrillSize,
      height = stack.SlotY > 0 ? stack.SlotY : stack.DrillSize;
    const first = stack.Components[(stack.NumFixedCompEntries ?? 21) + 2];
    if (
      padDimensions(first) &&
      width !== height &&
      first.H > first.W !== height > width
    )
      [width, height] = [height, width];
    return {
      width: width * scale,
      height: height * scale,
      plated: stack.Plated ?? !!(stack.Flags & 0x20),
    };
  }
}
