import { test, expect } from "vitest";
import {
  argument,
  parseDefStatement,
  parseDefText,
  type DefCall,
} from "../../src/lib/hfss/metadata/text";

test("embedded metadata preserves quoted multiline properties and nested named/positional calls", () => {
  const text =
    "$begin ''\nMode='Laminate'\nSLayer(Layer(N='TOP', ID=15, T='signal', pps='$begin \\'pp\\'\\\n\\\tFlag=true\\\n$end \\'pp\\'\\\n'), SubL(Th='35um'))\n$end ''\n";
  const block = parseDefText(text);
  expect(block.properties.get("Mode")).toBe("Laminate");
  const layer = block.calls[0].args[0].value as DefCall;
  expect(argument(layer, "ID")).toBe(15);
  expect(argument(layer, "N")).toBe("TOP");
  const nested = parseDefText(String(argument(layer, "pps")));
  expect(nested.name).toBe("pp");
  expect(nested.properties.get("Flag")).toBe(true);
  const pad = parseDefStatement(
    "pad(shp='Cir', Szs('10mil'), X='0mil', R='90deg')",
  ).value as DefCall;
  expect(argument(pad, "R")).toBe("90deg");
  expect((pad.args[1].value as DefCall).args).toStrictEqual([
    { value: "10mil" },
  ]);
  expect(() => parseDefText("$begin 'x'\n$end 'y'")).toThrow(/closing/);
  expect(() => parseDefText("x='unfinished")).toThrow(/truncated/);
});

test("Python multizone layer metadata retains its declared region names", () => {
  const parsed = parseDefText("Mode='Multizone'\nZones[2: 'PRIMARY', 'FLEX']");
  expect(parsed.properties.get("Mode")).toBe("Multizone");
  expect(parsed.calls).toStrictEqual([
    { name: "Zones", args: [{ value: "PRIMARY" }, { value: "FLEX" }] },
  ]);
  expect(() => parseDefText("Zones[2: 'PRIMARY']")).toThrow(/count/);
});
