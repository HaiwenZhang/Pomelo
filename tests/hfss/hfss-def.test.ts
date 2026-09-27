import { test, expect } from "vitest";

import { PadShape } from "../../src/lib/board/shapes/pad";
import type {
  DefDatabase,
  DefObject,
  DefValue,
} from "../../src/lib/hfss/binary/def";
import { readDef } from "../../src/lib/hfss/binary/def";
import { defPolygonPath, defPrimitivePath } from "../../src/lib/hfss/geometry";
import {
  defPrimitiveInfo,
  readDefLayout,
} from "../../src/lib/hfss/metadata/layout";
import {
  defDrill,
  defPadInstance,
  defPadShape,
  defQuantity,
  defStandardPad,
  defTextPolygon,
  defUsedPadLayers,
  type DefPadstacks,
} from "../../src/lib/hfss/metadata/padstack";
import {
  argument,
  parseDefStatement,
  parseDefText,
  type DefCall,
} from "../../src/lib/hfss/metadata/text";

const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
};
const f64 = (n: number) => {
  const b = Buffer.alloc(8);
  b.writeDoubleLE(n);
  return b;
};
const string = (s: string) => {
  const b = Buffer.from(s);
  return Buffer.concat([u32(b.length), b]);
};
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
function fixture(fields: number[], payload: Buffer[], version = "12.1") {
  const b = Buffer.concat([
    Buffer.from([0]),
    string(
      `$begin 'Hdr'\n Version='${version}'\n Encrypted=false\n$end 'Hdr'\n`,
    ),
    u32(-1),
    u32(1),
    u32(0),
    u32(fields.length),
    ...fields.flatMap((t, i) => [u32(i), u32(t)]),
    u32(-1),
    u32(1),
    u32(0),
    ...payload,
    u32(-1),
  ]);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
}
test("DEF declared field types retain numeric bits, cached expressions, UTF-8 and heterogeneous properties", async () => {
  const result = await readDef(
    fixture(
      [0, 1, 2, 3, 4, 5, 6, 7],
      [
        Buffer.from([1]),
        u32(-17),
        f64(-0),
        f64(0.0004),
        string("w"),
        string("层一"),
        u32(-1),
        u32(2),
        u32(2),
        f64(0.001),
        f64(0.002),
        u32(2),
        u32(1),
        u32(28),
        u32(4),
        string("True"),
      ],
    ),
  );
  expect(result.root.fields).toStrictEqual([
    1,
    -17,
    -0,
    { number: 0.0004, expression: "w" },
    "层一",
    null,
    [0.001, 0.002],
    [28, "True"],
  ]);
  expect(Object.is(result.root.fields[2], -0)).toBeTruthy();
  expect(result.counts.get(0)).toBe(1);
  expect(result.version).toBe("12.1");
});
test("DEF bounds, root framing, unsupported versions/encodings and invalid text fail explicitly", async () => {
  const good = fixture([4], [string("x")]);
  await expect(readDef(good.slice(0, -1))).rejects.toThrow(/截断/);
  const extra = new Uint8Array(good.byteLength + 4);
  extra.set(new Uint8Array(good));
  await expect(readDef(extra.buffer)).rejects.toThrow(/长度/);
  await expect(readDef(fixture([], [], "99.1"))).rejects.toThrow(/版本/);
  await expect(readDef(fixture([8], []))).rejects.toThrow(/值类型 8/);
  await expect(readDef(fixture([4], [u32(0x7fffffff)]))).rejects.toThrow(
    /截断/,
  );
  await expect(
    readDef(fixture([4], [u32(2), Buffer.from([0xc0, 0xff])])),
  ).rejects.toThrow(/UTF-8/);
  await expect(
    readDef(fixture([6], [u32(1), u32(0xffffffff)])),
  ).rejects.toThrow(/数组/);
  expect(
    (await readDef(fixture([6], [u32(0), u32(0xffffffff)]))).root.fields,
  ).toStrictEqual([[]]);
});
test("DEF yields during a large numeric vector and accepts a fresh import after cancellation", async () => {
  const input = fixture([6], [u32(1_000_000), u32(2), Buffer.alloc(8_000_000)]),
    controller = new AbortController();
  const task = readDef(input, controller.signal),
    timer = setTimeout(() => controller.abort(), 0);
  try {
    await expect(task).rejects.toMatchObject({ name: "AbortError" });
  } finally {
    clearTimeout(timer);
  }
  expect((await readDef(fixture([], []))).root.schema).toBe(0);
});

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
  expect(() => parseDefText("$begin 'x'\n$end 'y'")).toThrow(/闭合/);
  expect(() => parseDefText("x='unfinished")).toThrow(/截断/);
});

test("DEF signed sagitta reproduces native EDB arc center, radius and direction without tessellation", () => {
  const path = defPolygonPath({
    schema: 36,
    offset: 0,
    end: 0,
    fields: [
      1,
      2,
      [
        0.001,
        0.012,
        0.002,
        Number.MAX_VALUE,
        0.011,
        0.012,
        0.011,
        0.014,
        0.001,
        0.014,
      ],
    ],
  });
  expect(path.length).toBe(4);
  const arc = path[0].arc!;
  expect(Math.abs(arc.center[0] - 6) < 1e-12).toBeTruthy();
  expect(Math.abs(arc.center[1] - 6.75) < 1e-12).toBeTruthy();
  expect(Math.abs(arc.radius - 7.25) < 1e-12).toBeTruthy();
  expect(arc.sweep < 0).toBeTruthy();
  const reverse = defPolygonPath({
    schema: 36,
    offset: 0,
    end: 0,
    fields: [0, 2, [0.011, 0.012, -0.002, Number.MAX_VALUE, 0.001, 0.012]],
  })[0].arc!;
  expect(Math.abs(reverse.center[1] - arc.center[1]) < 1e-12).toBeTruthy();
  expect(Math.abs(reverse.sweep + arc.sweep) < 1e-12).toBeTruthy();
  const major = defPolygonPath({
    schema: 36,
    offset: 0,
    end: 0,
    fields: [0, 2, [0, 0, 0.02, Number.MAX_VALUE, 0.01, 0]],
  })[0].arc!;
  expect(major.sweep < -Math.PI).toBeTruthy();
  expect(() =>
    defPolygonPath({
      schema: 36,
      offset: 0,
      end: 0,
      fields: [0, 0, [0, 0, 0.002, Number.MAX_VALUE]],
    }),
  ).toThrow(/缺少端点/);
});

test("DEF resolves independent ID namespaces, reversed layer IDs and out-of-order void ownership", async () => {
  const obj = (schema: number, ...fields: DefValue[]): DefObject => ({
    schema,
    fields,
    offset: 0,
    end: 0,
  });
  const primitive = (id: number, parent: number, layer = 15, net = 7) =>
    obj(
      15,
      obj(11, obj(10, obj(5, id), net, -1, 0), layer, 0, 0, parent),
      obj(36, 1, 0, []),
    );
  const hole = primitive(8, 3),
    outer = primitive(3, -1);
  const layout = obj(
    4,
    "",
    [obj(7, obj(5, 7), "GND")],
    [],
    [],
    [hole, outer],
    [],
    [],
  );
  const cell = obj(
    3,
    "dn='Board'",
    "",
    "SLayer(Layer(N='TOP',ID=15,T='signal'))\nSLayer(Layer(N='BOTTOM',ID=1,T='signal'))",
    [],
    layout,
  );
  const db: DefDatabase = {
    root: obj(
      0,
      "",
      obj(1, [obj(2, "footprint", [obj(3, "unrelated")])]),
      obj(1, [obj(2, "layout", [cell])]),
    ),
    version: "12.1",
    header: "",
    schemas: new Map(),
    counts: new Map(),
    values: 0,
    bytes: 0,
  };
  const result = await readDefLayout(db);
  expect(result.name).toBe("Board");
  expect([...result.layers.keys()]).toStrictEqual([15, 1]);
  expect(result.nets.get(7)).toBe("GND");
  expect(result.voids.get(3)).toStrictEqual([hole]);
  expect(defPrimitiveInfo(outer)).toStrictEqual({
    id: 3,
    net: 7,
    component: -1,
    layer: 15,
    parent: -1,
  });
  layout.fields[4] = [hole];
  await expect(readDefLayout(db)).rejects.toThrow(/缺失父图元/);
  layout.fields[4] = [outer, primitive(8, 3, 1)];
  await expect(readDefLayout(db)).rejects.toThrow(/不在同一层/);
  layout.fields[4] = [outer, primitive(9, -1, 99)];
  await expect(readDefLayout(db)).rejects.toThrow(/缺失层/);
  layout.fields[4] = [outer, primitive(9, -1, 15, 999)];
  await expect(readDefLayout(db)).rejects.toThrow(/缺失网络/);
  layout.fields[4] = [outer, outer];
  await expect(readDefLayout(db)).rejects.toThrow(/重复图元/);
  const controller = new AbortController();
  controller.abort();
  await expect(readDefLayout(db, controller.signal)).rejects.toMatchObject({
    name: "AbortError",
  });
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

test("DEF rotated round rectangle uses its center and reproduces native fixture tangent points", () => {
  const n = (number: number) => ({ number, expression: "" });
  const path = defPrimitivePath({
    schema: 12,
    offset: 0,
    end: 0,
    fields: [
      null,
      2,
      n(0.018),
      n(0.001),
      n(0.022),
      n(0.003),
      n(0.0003),
      n(Math.PI / 6),
    ],
  });
  expect(path.length).toBe(8);
  const expectedStart = [19.02775681356646, 0.2839745962155641],
    expectedEnd = [21.972243186433545, 1.9839745962155608];
  const edge = path.find(
    (s) =>
      Math.hypot(s.a[0] - expectedStart[0], s.a[1] - expectedStart[1]) < 1e-10,
  )!;
  expect(edge).toBeTruthy();
  expect(
    Math.hypot(edge.b[0] - expectedEnd[0], edge.b[1] - expectedEnd[1]) < 1e-10,
  ).toBeTruthy();
  expect(edge.arc).toBe(undefined);
  expect(
    path
      .filter((s) => s.arc)
      .every((s) => Math.abs(s.arc!.radius - 0.3) < 1e-12 && s.arc!.sweep > 0),
  ).toBeTruthy();
});

test("DEF Padstack usage preserves disabled regular pads instead of drawing every definition layer", () => {
  expect([...defUsedPadLayers("2:1:6:1:10:2:24:3:")]).toStrictEqual([2, 6, 24]);
  expect([...defUsedPadLayers("2:0:24:1:")]).toStrictEqual([24]);
  expect(defUsedPadLayers("").size).toBe(0);
  expect(() => defUsedPadLayers("2:2:2:1:")).toThrow(/使用层/);
  expect(() => defUsedPadLayers("2:7:")).toThrow(/使用表/);
  expect(() => defUsedPadLayers("2:1")).toThrow(/使用表/);
});
