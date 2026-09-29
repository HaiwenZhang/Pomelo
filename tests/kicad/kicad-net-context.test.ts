import { expect, test } from "vitest";
import { importKiCad } from "../../src/lib/kicad/import";

test("track, footprint pad and saved fill share named and numbered network identity", async () => {
  const source = `(kicad_pcb
    (version 20260206)
    (layers (0 "F.Cu" signal) (2 "B.Cu" signal))
    (net 7 "GND")
    (segment (start 0 0) (end 1 0) (width 0.2) (layer "F.Cu") (net 7))
    (footprint "J" (layer "F.Cu") (at 10 20)
      (property "Reference" "J1")
      (pad "1" smd rect (at 0 0) (size 2 2) (layers "F.Cu") (net "GND"))
      (pad "2" smd rect (at 3 0) (size 2 2) (layers "F.Cu") (net "SIGNAL")))
    (zone (net "SIGNAL")
      (filled_polygon (layer "F.Cu") (pts (xy 0 0) (xy 1 0) (xy 1 1) (xy 0 1)))))`;
  const { scene } = await importKiCad(new TextEncoder().encode(source).buffer);
  expect([...scene.nets]).toEqual([
    [7, "GND"],
    [8, "SIGNAL"],
  ]);
  expect(scene.segments[0].net).toBe(7);
  expect(scene.pins.map((pin) => pin.net)).toEqual([7, 8]);
  expect(scene.zones[0].net).toBe(8);
});

test("numbered references still require a source definition", async () => {
  const source = `(kicad_pcb (version 20260206)
    (layers (0 "F.Cu" signal) (2 "B.Cu" signal))
    (segment (start 0 0) (end 1 0) (width 0.2) (layer "F.Cu") (net 42)))`;
  await expect(
    importKiCad(new TextEncoder().encode(source).buffer),
  ).rejects.toThrow(/未知网络 42/);
});
