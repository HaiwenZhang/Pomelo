import type { Pin } from "../model";

/** Die pads follow copper visibility and priority rather than ordinary pins. */
export function pinDisplayCategory(pin: Pin): "etch" | "pin" {
  return pin.die ? "etch" : "pin";
}
