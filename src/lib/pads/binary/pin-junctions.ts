import type { PadsContainer } from "./container";
import { PADS_BASIC_TO_MM } from "./metadata";
import { cooperative } from "../../cooperative";
/** Type 22 also carries non-pin records. Keep their source IDs and states;
 * state 0x21 is a pin too, so equality to 1 would lose valid instances. */
export class PadsPinJunctionReader {
  constructor(private readonly container: PadsContainer) {}
  async read(signal?: AbortSignal) {
    const { container } = this;
    const s = container.sections[60],
      stride = s.count ? s.declaredBytes / s.count : 36,
      pause = cooperative(signal),
      typeOffset = container.version === 0x2011 ? 19 : 27;
    signal?.throwIfAborted();
    if (
      !Number.isInteger(stride) ||
      stride < typeOffset + 7 ||
      s.offset < 0 ||
      s.offset + s.bytes > container.view.byteLength
    )
      throw new Error("PADS 引脚接点记录范围无效");
    const pins: {
        junction: number;
        placement: number;
        terminal: number;
        state: number;
        at: [number, number];
        sourceOffset: number;
      }[] = [],
      other: {
        junction: number;
        state: number;
      }[] = [];
    for (let junction = 0; junction < s.count; junction++) {
      if (junction % 512 === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const at = s.offset + junction * stride;
      if (container.view.getUint8(at + typeOffset) !== 22) continue;
      const state = container.view.getUint8(at + typeOffset + 5);
      if ((state & 31) !== 1) {
        other.push({ junction, state });
        continue;
      }
      pins.push({
        junction,
        placement:
          container.view.getUint32(at + typeOffset - 3, true) & 0xffffff,
        terminal: container.view.getUint16(at + typeOffset + 1, true),
        state,
        at: [
          container.view.getInt32(at, true) * PADS_BASIC_TO_MM,
          container.view.getInt32(at + 4, true) * PADS_BASIC_TO_MM,
        ],
        sourceOffset: at,
      });
    }
    return { pins, other };
  }
}
/** Compatibility entry point; parsing state belongs to PadsPinJunctionReader. */
export async function readPadsPinJunctions(
  container: PadsContainer,
  signal?: AbortSignal,
) {
  return new PadsPinJunctionReader(container).read(signal);
}
