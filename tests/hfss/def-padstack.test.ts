import { test, expect } from "vitest";
import { PadShape } from "../../src/lib/board/shapes/pad";
import type {
  DefDatabase,
  DefObject,
  DefValue,
} from "../../src/lib/hfss/binary/def";
import { defPolygonPath } from "../../src/lib/hfss/geometry";
import type { DefLayout } from "../../src/lib/hfss/metadata/layout";
import {
  defDrill,
  defPadInstance,
  defPadShape,
  defQuantity,
  defStandardPad,
  defTextPolygon,
  defUsedPadLayers,
  DefPadstackReader,
  type DefPadstacks,
} from "../../src/lib/hfss/metadata/padstack";
import {
  parseDefStatement,
  type DefCall,
} from "../../src/lib/hfss/metadata/text";

test("DEF rejects active hole overrides and unknown instance extensions instead of silently misrendering", () => {
  const object = (schema: number, fields: DefValue[]): DefObject => ({
    schema,
    fields,
    offset: 0,
    end: 0,
  });
  const n = (number: number) => ({ number, expression: "" });
  const fields: DefValue[] = [
    object(10, [object(5, [42]), -1, -1]),
    7,
    n(0.003),
    n(0.004),
    n(0),
    n(0.0006),
    "P1",
    -1,
    "",
    0,
    1,
    [],
    "",
  ];
  const bindings = {
    definitions: new Map(),
    bindings: new Map([[7, { id: 7 }]]),
  } as DefPadstacks;
  const read = () => defPadInstance(object(19, fields), bindings);
  expect(read().pin).toBe(true); // A disabled stored override must not affect geometry.
  fields[9] = 1;
  expect(read).toThrow(/孔径覆盖/);
  fields[9] = 0;
  for (const index of [8, 11, 12]) {
    const previous = fields[index];
    fields[index] = index === 11 ? [1] : "unknown";
    expect(read).toThrow(/扩展字段/);
    fields[index] = previous;
  }
  fields[10] = 2;
  expect(read).toThrow(/Pin 标志/);
});
test("DEF physical units and independent pad rotation preserve dimensions and offsets", () => {
  expect(defQuantity("10mil", "length")).toBe(0.000254);
  expect(defQuantity("180deg", "angle")).toBe(Math.PI);
  expect(defQuantity("1e-3m", "length")).toBe(0.001);
  expect(() => defQuantity("1mm + width", "length")).toThrow(/表达式/);
  expect(() => defQuantity("2GHz", "length")).toThrow(/单位/);
  const call = (s: string) => parseDefStatement(s).value as DefCall;
  const pad = defStandardPad(
    call("pad(shp='Rct',Szs('4mm','2mm'),X='1mm',Y='-2mm',R='90deg')"),
    3,
  )!;
  const bounds = new PadShape(pad).bounds({ at: [0, 0] });
  expect(Math.abs(bounds.minX) < 1e-12).toBeTruthy();
  expect(Math.abs(bounds.maxX - 2) < 1e-12).toBeTruthy();
  expect(Math.abs(bounds.minY + 4) < 1e-12).toBeTruthy();
  expect(Math.abs(bounds.maxY) < 1e-12).toBeTruthy();
  const oval = defStandardPad(
    call("pad(shp='Ov',Szs('4mm','2mm','0.4mm'),X='0mm',Y='0mm',R='30deg')"),
    1,
  )!;
  expect(oval.corner).toBe(0.4);
  expect(oval.customPaths![0].filter((s) => s.arc).length).toBe(4);
  expect(
    defStandardPad(
      call("hle(shp='Cir',Szs('0mil'),X='0mm',Y='0mm',R='0deg')"),
      0,
    ),
  ).toBe(null);
  expect(() =>
    defStandardPad(
      call("pad(shp='Rct',Szs('4mm'),X='0mm',Y='0mm',R='0deg')"),
      1,
    ),
  ).toThrow(/尺寸/);
});

test("Python oval slot hole retains its full envelope and rotation", () => {
  const call = parseDefStatement(
    "hle(shp='Ov',Szs('4mm','2mm','1mm'),X='0.1mm',Y='-0.2mm',R='90deg')",
  ).value as DefCall;
  const hole = defDrill(call);
  expect(hole.width).toBe(4);
  expect(hole.height).toBe(2);
  expect(hole.angle).toBe(Math.PI / 2);
  expect(hole.offset).toStrictEqual([0.1, -0.2]);
});

test("Python polygon pad hole remains empty copper", () => {
  const call = parseDefStatement(
    "pad(shp='Ply',Szs(),ply(cw=false,cl=true,pt(U='mm',x=-2,y=0,x=-2,y=1e200,x=2,y=0,x=-2,y=1e200,x=-2,y=0),hls(hl(cw=true,cl=true,pt(U='mm',x=-1,y=0,x=-1,y=1e200,x=1,y=0,x=-1,y=1e200,x=-1,y=0)))),X='0mm',Y='0mm',R='0deg')",
  ).value as DefCall;
  const pad = defPadShape(call, 0)!;
  expect(pad.customPaths).toHaveLength(2);
  expect(new PadShape(pad).distance([0, 0], { at: [0, 0] })).toBeGreaterThan(0);
  expect(new PadShape(pad).distance([1.5, 0], { at: [0, 0] })).toBeLessThan(0);
});

test("Python die pad binding accepts its empty terminal layer and mapping", () => {
  const obj = (schema: number, ...fields: DefValue[]): DefObject => ({
    schema,
    fields,
    offset: 0,
    end: 0,
  });
  const db = {
    root: obj(
      0,
      "$begin 'Root'\n$begin 'pds'\n$begin 'pd'\nid=3\n$begin 'psd'\nnam='DIE'\n$begin 'pds'\n$begin 'lgm'\nid=3\nlay='TOP'\npad(shp='Sq',Szs('0.0761mm'),X='0mm',Y='0mm',R='0deg')\n$end 'lgm'\n$end 'pds'\nhle(shp='Cir',Szs('0mm'),X='0mm',Y='0mm',R='0deg')\n$end 'psd'\n$end 'pd'\n$end 'pds'\n$end 'Root'",
    ),
  } as DefDatabase;
  const binding = obj(
    6,
    3,
    "$begin ''\ndef=3\nfl=3\ntl=0\nflp=false\nsbl=-100\n$begin 'lm'\nforward()\n$end 'lm'\npum=''\n$end ''",
  );
  const layout = {
    cell: obj(3, "", "", "", [binding]),
    layers: new Map([
      [3, { id: 3, name: "TOP", type: "signal", stackup: true }],
    ]),
  } as DefLayout;
  const result = new DefPadstackReader(db, layout).read();
  expect(result.bindings.get(3)?.last).toBe(0);
  expect(result.bindings.get(3)?.forward).toStrictEqual([]);
  expect(result.bindings.get(3)?.definition.layers.size).toBe(1);
  expect(result.bindings.get(3)?.die).toBe(true);
});

test("DEF text polygon arc sentinels reproduce the native panda slot contour", () => {
  const call = parseDefStatement(
    "hle(shp='Ply',Szs(),ply(cw=false,cl=true,pt(U='mm',x=-1.016,y=-0.508,x=1.016,y=-0.508,x=-0.508,y=1e200,x=1.016,y=0.508,x=-1.016,y=0.508,x=-0.508,y=1e200,x=-1.016,y=-0.508)),X='0mm',Y='0mm',R='0deg')",
  ).value as DefCall;
  const polygon = defTextPolygon(call),
    path = defPolygonPath(polygon);
  expect((polygon.fields[2] as number[]).length).toBe(12);
  expect(path.length).toBe(4);
  expect(path.filter((s) => s.arc).length).toBe(2);
  expect(
    path
      .filter((s) => s.arc)
      .every((s) => Math.abs(s.arc!.radius - 0.508) < 1e-12),
  ).toBeTruthy();
  const pad = defPadShape(call, 0)!;
  expect(Math.abs(pad.width - 3.048) < 1e-12).toBeTruthy();
  expect(Math.abs(pad.height - 1.016) < 1e-12).toBeTruthy();
  const drill = defDrill(call);
  expect(Math.abs(drill.width - 3.048) < 1e-12).toBeTruthy();
  expect(Math.abs(drill.height - 1.016) < 1e-12).toBeTruthy();
  expect(drill.offset).toStrictEqual([0, 0]);
  const nonSlot = parseDefStatement(
    "hle(shp='Ply',Szs(),ply(cl=true,pt(U='mm',x=0,y=0,x=1,y=0,x=1,y=1,x=0,y=1)),X='0mm',Y='0mm',R='0deg')",
  ).value as DefCall;
  expect(() => defDrill(nonSlot)).toThrow(/直槽孔/);
});

test("DEF Padstack usage preserves disabled regular pads instead of drawing every definition layer", () => {
  expect([...defUsedPadLayers("2:1:6:1:10:2:24:3:")]).toStrictEqual([2, 6, 24]);
  expect([...defUsedPadLayers("2:0:24:1:")]).toStrictEqual([24]);
  expect(defUsedPadLayers("").size).toBe(0);
  expect(() => defUsedPadLayers("2:2:2:1:")).toThrow(/使用层/);
  expect(() => defUsedPadLayers("2:7:")).toThrow(/使用表/);
  expect(() => defUsedPadLayers("2:1")).toThrow(/使用表/);
});
