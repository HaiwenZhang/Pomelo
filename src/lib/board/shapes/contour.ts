import earcut from "earcut";
/** Format-independent contour shape; coordinates are in board space. */
export class ContourShape {
  constructor(readonly data: ArrayLike<number>) {}
  /** Strict convex contours need no linked nodes or spatial ear search. Preserve
   * earcut 3.2.3's clipping order; all uncertain/degenerate contours use earcut.
   * X-monotonicity is also checked: equal local turns alone admit winding stars. */
  convexIndices(): number[] | undefined {
    const data = this.data;
    const count = data.length / 2;
    if (!Number.isInteger(count) || count < 3) return;
    let winding = 0,
      signedArea = 0,
      firstX = 0,
      lastX = 0,
      changes = 0;
    for (let i = 0, j = count - 1; i < count; j = i++) {
      const k = i + 1 === count ? 0 : i + 1;
      const ax = data[j * 2],
        ay = data[j * 2 + 1],
        bx = data[i * 2],
        by = data[i * 2 + 1],
        cx = data[k * 2],
        cy = data[k * 2 + 1];
      if (!Number.isFinite(bx) || !Number.isFinite(by)) return;
      const left = (bx - ax) * (cy - by),
        right = (by - ay) * (cx - bx),
        turn = left - right;
      // The tolerance only selects the fast path; it never simplifies vertices.
      if (!(Math.abs(turn) > 1e-12 * (Math.abs(left) + Math.abs(right))))
        return;
      const direction = turn > 0 ? 1 : -1;
      if (winding && direction !== winding) return;
      winding = direction;
      signedArea += (ax - bx) * (by + ay);
      const dx = cx - bx;
      if (dx) {
        const sign = dx > 0 ? 1 : -1;
        if (!firstX) firstX = sign;
        else if (sign !== lastX) changes++;
        lastX = sign;
      }
    }
    if (lastX !== firstX) changes++;
    if (
      changes !== 2 ||
      !Number.isFinite(signedArea) ||
      signedArea * winding <= 0
    )
      return;
    const forward = signedArea > 0,
      anchor = forward ? count - 2 : 1,
      result: number[] = [];
    let current = forward ? count - 1 : 0;
    for (let t = 0; t < count - 2; t++) {
      const next = forward
        ? (current + 1) % count
        : (current + count - 1) % count;
      const ax = data[anchor * 2],
        ay = data[anchor * 2 + 1],
        bx = data[current * 2],
        by = data[current * 2 + 1],
        cx = data[next * 2],
        cy = data[next * 2 + 1];
      const left = (bx - ax) * (cy - by),
        right = (by - ay) * (cx - bx);
      if (!(left - right > 1e-12 * (Math.abs(left) + Math.abs(right)))) return;
      result.push(anchor, current, next);
      current = next;
    }
    return result;
  }
  /** Independent outer/hole ring only: holes are subtracted by the GPU mask. */
  triangulate() {
    const data = this.data;
    return this.convexIndices() ?? earcut(data);
  }
}
