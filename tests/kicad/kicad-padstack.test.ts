import { expect, test } from "vitest";

import { indexKiCadBoard } from "../../src/lib/kicad/syntax/index";
import { KiCadRouteBuilder } from "../../src/lib/kicad/scene/routes";
import { KiCadPadBuilder } from "../../src/lib/kicad/scene/pads";

test("KiCad padstacks accept named inner copper layers", async () => {
  const bytes = new TextEncoder().encode(`(kicad_pcb
    (version 20260206)
    (layers (0 "F.Cu" signal) (4 "In1.Cu" signal) (6 "In2.Cu" signal) (2 "B.Cu" signal))
    (footprint "PTH" (layer "F.Cu") (at 10 20)
      (property "Reference" "J1")
      (pad "1" thru_hole circle (at 0 0) (size 2 2) (drill 1)
        (layers "*.Cu" "*.Mask")
        (padstack (mode custom)
          (layer "In1.Cu" (shape rect) (size 1.5 1))
          (layer "Inner" (shape oval) (size 1.2 1)))))
  )`);
  const index = await indexKiCadBoard(bytes);
  const routes = await new KiCadRouteBuilder(index).build();
  const pads = await new KiCadPadBuilder(
    index,
    routes.layers,
    routes.nets,
  ).build();
  expect(pads.layerOverrides).toBe(2);
  expect(pads.pins).toHaveLength(1);
  expect(
    pads.pins[0].shapes.map(({ layer, type, width, height }) => ({
      layer,
      type,
      width,
      height,
    })),
  ).toEqual([
    { layer: 0, type: 2, width: 2, height: 2 },
    { layer: 1, type: 6, width: 1.5, height: 1 },
    { layer: 2, type: 11, width: 1.2, height: 1 },
    { layer: 3, type: 2, width: 2, height: 2 },
  ]);
});
