import type { Point } from "../../board/model";

/** KiCad can serialize one filled polygon as an outer contour with holes
 * joined by paired, opposite-direction bridge edges. Remove those bridges
 * before triangulation so each contour stays small. */
export function splitKiCadFillRing(ring: Point[]): Point[][] {
  const count = ring.length;
  const next = new Uint32Array(count);
  const pending = new Map<string, number[]>();
  for (let i = 0; i < count; i++) next[i] = (i + 1) % count;
  let bridges = 0;
  for (let i = 0; i < count; i++) {
    const j = next[i];
    const a = ring[i],
      b = ring[j];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const forward = `${a[0]},${a[1]}|${b[0]},${b[1]}`;
    const reverse = `${b[0]},${b[1]}|${a[0]},${a[1]}`;
    const matches = pending.get(reverse);
    if (matches?.length) {
      const mate = matches.pop()!;
      next[i] = (mate + 1) % count;
      next[mate] = j;
      bridges++;
    } else {
      const matches = pending.get(forward) ?? [];
      matches.push(i);
      pending.set(forward, matches);
    }
  }
  if (!bridges) return [ring];

  const seen = new Uint8Array(count);
  const contours: { points: Point[]; area: number }[] = [];
  for (let start = 0; start < count; start++) {
    if (seen[start]) continue;
    const points: Point[] = [];
    let at = start,
      area = 0;
    do {
      if (seen[at]) return [ring];
      seen[at] = 1;
      const following = next[at];
      const a = ring[at],
        b = ring[following];
      if (
        !points.length ||
        a[0] !== points[points.length - 1][0] ||
        a[1] !== points[points.length - 1][1]
      )
        points.push(a);
      area += a[0] * b[1] - b[0] * a[1];
      at = following;
    } while (at !== start);
    if (
      points.length > 1 &&
      points[0][0] === points[points.length - 1][0] &&
      points[0][1] === points[points.length - 1][1]
    )
      points.pop();
    if (points.length < 3) return [ring];
    contours.push({ points, area });
  }
  const outer = contours.reduce(
    (largest, contour, index) =>
      Math.abs(contour.area) > Math.abs(contours[largest].area)
        ? index
        : largest,
    0,
  );
  const outerSign = Math.sign(contours[outer].area);
  if (
    !outerSign ||
    contours.some(
      (contour, index) =>
        index !== outer && Math.sign(contour.area) === outerSign,
    )
  )
    return [ring];
  return [
    contours[outer].points,
    ...contours
      .filter((_, index) => index !== outer)
      .map((contour) => contour.points),
  ];
}
