import { expect, test } from "vitest";

import { splitKiCadFillRing } from "../../src/lib/kicad/scene/fill-rings";
import { PolygonShape } from "../../src/lib/board/shapes/polygon";
import { CopperMesh } from "../../src/lib/board/copper-mesh";
import type { Point } from "../../src/lib/board/model";

test("KiCad filled polygon bridges split into an outer ring and holes", async () => {
  const stitched: Point[] = [
    [0, 0],
    [0, 10],
    [10, 10],
    [10, 0],
    [7, 3],
    [7, 7],
    [3, 7],
    [3, 3],
    [7, 3],
    [10, 0],
  ];
  const rings = splitKiCadFillRing(stitched);
  expect(rings).toHaveLength(2);
  const shape = new PolygonShape(rings);
  expect(shape.contains([1, 1])).toBe(true);
  expect(shape.contains([5, 5])).toBe(false);
  expect(shape.contains([11, 5])).toBe(false);
  expect(rings[0]).toHaveLength(4);
  expect(rings[1]).toHaveLength(4);
  expect(splitKiCadFillRing(rings[0])).toEqual([rings[0]]);
  const mesh = await new CopperMesh(rings).build();
  expect(mesh.ringOffsets).toEqual(new Uint32Array([0, 4, 8]));
  expect(mesh.outerCount).toBeGreaterThan(0);
  expect(mesh.indices.length).toBeGreaterThan(mesh.outerCount);
  expect(splitKiCadFillRing([...stitched].reverse())).toHaveLength(2);
});
