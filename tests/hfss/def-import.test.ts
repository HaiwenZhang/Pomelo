import { test, expect } from "vitest";
import {
  BOND_TOP_LAYER,
  BOND_WIRE_TOP_LAYER,
} from "../../src/lib/board/layers";
import type { DefObject, DefValue } from "../../src/lib/hfss/binary/def";
import { importHfss } from "../../src/lib/hfss/import";
import { encodeDefObject } from "./def-test-utils";

test("Python DEF renders a bond wire and an unconnected die pad", async () => {
  const object = (schema: number, ...fields: DefValue[]): DefObject => ({
    schema,
    fields,
    offset: 0,
    end: 0,
  });
  const number = (value: number) => ({ number: value, expression: "" });
  const metadata =
    "$begin 'Root'\n$begin 'pds'\n$begin 'pd'\nid=3\n$begin 'psd'\nnam='DIE'\n$begin 'pds'\n$begin 'lgm'\nid=3\nlay='TOP'\npad(shp='Sq',Szs('0.0761mm'),X='0mm',Y='0mm',R='0deg')\n$end 'lgm'\n$end 'pds'\nhle(shp='Cir',Szs('0mm'),X='0mm',Y='0mm',R='0deg')\n$end 'psd'\n$end 'pd'\n$end 'pds'\n$end 'Root'";
  const binding = object(
    6,
    3,
    "$begin ''\ndef=3\nfl=3\ntl=0\nflp=false\nsbl=-100\n$begin 'lm'\nforward()\n$end 'lm'\npum=''\n$end ''",
  );
  const wire = object(
    16,
    object(
      14,
      object(11, object(10, object(5, 123), -1, -1, 0), 15, 0, 0, -1),
      0,
      0,
      0,
      number(0.0000254),
      number(0.6),
      object(36, 0, 2, [0, 0, 0.001, 0]),
      object(36, 0, 0, []),
      1,
    ),
    "TOP",
    0,
    "GOLD",
    0,
    number(0),
    -1,
    -1,
    1,
    1,
  );
  const pad = object(
    19,
    object(10, object(5, 124), -1, -1, 0),
    3,
    number(0.002),
    number(0.003),
    number(0),
    number(0),
    "D1",
    -1,
    "",
    0,
    0,
    [],
    "",
  );
  const root = object(
    0,
    metadata,
    object(1, []),
    object(1, [
      object(2, "layout", [
        object(
          3,
          "dn='Board'",
          "",
          "SLayer(Layer(N='TOP',ID=3,T='signal'))\nLayer(N='WIRE_TOP',ID=15,T='wirebond')",
          [binding],
          object(4, "", [], [], [], [wire], [pad], []),
        ),
      ]),
    ]),
  );

  const { scene } = await importHfss(encodeDefObject(root));
  expect(
    scene.segments.filter((s) => s.layer === BOND_WIRE_TOP_LAYER),
  ).toHaveLength(1);
  expect(scene.segments[0].bondWire?.profile).toBe("TOP");
  expect(scene.pins).toHaveLength(1);
  expect(scene.pins[0].shapes.map((shape) => shape.layer)).toStrictEqual([
    BOND_TOP_LAYER,
  ]);
  expect(scene.pins[0].die?.padstackName).toBe("DIE");
  expect(scene.vias).toHaveLength(0);
});
