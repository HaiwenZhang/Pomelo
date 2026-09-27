import { test, expect } from "vitest";
import earcut from "earcut";

import { ContourShape } from "../../src/lib/board/shapes/contour";

test("convex contour triangles preserve earcut order across winding, sizes and affine transforms", () => {
  let accepted = 0;
  for (const n of [3, 4, 5, 8, 32, 80, 81, 256, 1024])
    for (const reversed of [false, true])
      for (const scale of [1e-6, 1, 1e6])
        for (const offset of [0, 10000, 1e8]) {
          const points = Array.from({ length: n }, (_, i) => {
            const angle = (i / n + 0.137) * 2 * Math.PI,
              x = Math.cos(angle) * scale,
              y = Math.sin(angle) * scale;
            return [offset + 2 * x + 0.3 * y, -offset + 0.2 * x + 0.7 * y];
          });
          if (reversed) points.reverse();
          const data = points.flat(),
            fast = new ContourShape(data).convexIndices(),
            expected = earcut(data);
          if (offset === 0)
            expect(
              fast,
              "well-conditioned convex contour must use the fast path",
            ).toBeTruthy();
          if (fast) {
            accepted++;
            expect(
              fast,
              `n=${n}, reversed=${reversed}, scale=${scale}, offset=${offset}`,
            ).toStrictEqual(expected);
          }
          expect(new ContourShape(data).triangulate()).toStrictEqual(expected);
        }
  expect(accepted >= 54).toBeTruthy();
});

test("concave, collinear, repeated, and winding-star contours retain the general triangulator", () => {
  const rings = [
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [2, 2],
      [0, 4],
    ],
    [
      [0, 0],
      [2, 0],
      [4, 0],
      [4, 4],
      [0, 4],
    ],
    [
      [0, 0],
      [4, 0],
      [4, 4],
      [0, 4],
      [0, 0],
    ],
    [
      [0, 0],
      [4, 4],
      [0, 4],
      [4, 0],
    ],
    Array.from({ length: 5 }, (_, i) => {
      const a = (i * 4 * Math.PI) / 5;
      return [Math.cos(a), Math.sin(a)];
    }),
    [
      [0, 0],
      [1, 0],
      [1, 1e-15],
      [1, 1],
      [0, 1],
    ],
  ];
  for (const ring of rings)
    for (const points of [ring, ring.toReversed()]) {
      const data = points.flat();
      expect(new ContourShape(data).convexIndices()).toBe(undefined);
      expect(new ContourShape(data).triangulate()).toStrictEqual(earcut(data));
    }
  expect(new ContourShape([NaN, 0, 1, 0, 0, 1]).convexIndices()).toBe(
    undefined,
  );
  expect(new ContourShape([0, 0, 1, 0, 0, Infinity]).convexIndices()).toBe(
    undefined,
  );
});

test("irregular and permuted contours never change the reference triangle sequence", () => {
  let seed = 0x731946d;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let sample = 0; sample < 2000; sample++) {
    const count = 3 + Math.floor(random() * 40),
      angles = Array.from({ length: count }, () => random() * Math.PI * 2).sort(
        (a, b) => a - b,
      );
    const points = angles.map((a) => {
      const radius = sample % 3 ? 1 : 0.1 + random();
      return [Math.cos(a) * radius, Math.sin(a) * radius];
    });
    if (sample % 4 === 0)
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [points[i], points[j]] = [points[j], points[i]];
      }
    const data = points.flat();
    expect(
      new ContourShape(data).triangulate(),
      `sample ${sample}`,
    ).toStrictEqual(earcut(data));
  }
});
