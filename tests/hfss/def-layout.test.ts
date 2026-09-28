import { test, expect } from "vitest";
import type {
  DefDatabase,
  DefObject,
  DefValue,
} from "../../src/lib/hfss/binary/def";
import {
  defPrimitiveInfo,
  readDefLayout,
} from "../../src/lib/hfss/metadata/layout";

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

test("Python bond wire wrapper retains its nested path identity and layer", async () => {
  const obj = (schema: number, ...fields: DefValue[]): DefObject => ({
    schema,
    fields,
    offset: 0,
    end: 0,
  });
  const number = (value: number) => ({ number: value, expression: "" });
  const path = obj(
    14,
    obj(11, obj(10, obj(5, 123), -1, 7, 65540), 15, 0, 0, -1),
    0,
    0,
    0,
    number(0.0000254),
    number(0.6),
    obj(36, 0, 2, [0, 0, 0.001, 0]),
    obj(36, 0, 0, []),
    1,
  );
  const wire = obj(16, path, "TOP", 0, "GOLD", 0, number(0), -1, -1, 1, 1);
  const cell = obj(
    3,
    "dn='Board'",
    "",
    "SLayer(Layer(N='TOP',ID=1,T='signal'))\nLayer(N='WIRE_TOP',ID=15,T='wirebond')",
    [],
    obj(4, "", [], [], [], [wire], [], []),
  );
  const db: DefDatabase = {
    root: obj(0, "", obj(1, []), obj(1, [obj(2, "layout", [cell])])),
    version: "12.1",
    header: "",
    schemas: new Map(),
    counts: new Map(),
    values: 0,
    bytes: 0,
  };
  const layout = await readDefLayout(db);
  expect(layout.primitives.get(123)).toBe(wire);
  expect(defPrimitiveInfo(wire)).toStrictEqual({
    id: 123,
    net: -1,
    component: 7,
    layer: 15,
    parent: -1,
  });
});
