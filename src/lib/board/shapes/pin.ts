import type { Pin } from "../model";
/** Format-independent pin shape; coordinates are in board space. */
export class PinShape {
  constructor(readonly data: Pin) {}
  displayCategory(): "etch" | "pin" {
    const pin = this.data;
    return pin.die ? "etch" : "pin";
  }
}
