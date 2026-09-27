import { test, expect } from "vitest";

import { readPadsPinJunctions } from "../../src/lib/pads/binary/pin-junctions";
import type { PadsContainer } from "../../src/lib/pads/binary/container";
test("PADS pin junctions retain flag 0x21 and separate type-22 non-pin states across layouts", async () => {
  for (const version of [0x2011, 0x2026]) {
    const view = new DataView(new ArrayBuffer(256)),
      sections = Array.from({ length: 75 }, (_, index) => ({
        index,
        count: 0,
        declaredBytes: 0,
        offset: 0,
        bytes: 0,
        records: 0,
      })),
      stride = version === 0x2011 ? 36 : 64,
      type = version === 0x2011 ? 19 : 27;
    Object.assign(sections[60], {
      count: 4,
      bytes: stride * 4,
      declaredBytes: stride * 4,
    });
    for (let i = 0; i < 4; i++) {
      const at = i * stride;
      view.setUint32(at + type - 3, i + 10, true);
      view.setUint8(at + type, 22);
      view.setUint16(at + type + 1, i + 1, true);
      view.setUint8(at + type + 5, [1, 33, 4, 36][i]);
    }
    const c = {
        view,
        sections,
        version,
        postLayerOffset: 0,
        containerItemsOffset: 0,
      } as PadsContainer,
      r = await readPadsPinJunctions(c);
    expect(r.pins.map((p) => [p.placement, p.terminal, p.state])).toStrictEqual(
      [
        [10, 1, 1],
        [11, 2, 33],
      ],
    );
    expect(r.other).toStrictEqual([
      { junction: 2, state: 4 },
      { junction: 3, state: 36 },
    ]);
  }
});
