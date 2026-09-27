import type { Bounds } from "../board/model";
import type { Point } from "../board/model";

export interface ViewportInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export class Camera {
  x = 0;
  y = 0;
  scale = 10;
  flipped = false;
  get horizontalSign() {
    return this.flipped ? -1 : 1;
  }
  fit(bounds: Bounds, width: number, height: number, insets?: ViewportInsets) {
    const left = insets?.left ?? 0,
      right = insets?.right ?? 0;
    const top = insets?.top ?? 0,
      bottom = insets?.bottom ?? 0;
    this.scale =
      Math.min(
        Math.max(1, width - left - right) /
          Math.max(0.001, bounds.maxX - bounds.minX),
        Math.max(1, height - top - bottom) /
          Math.max(0.001, bounds.maxY - bounds.minY),
      ) * 0.86;
    this.x = ((right - left) / (2 * this.scale)) * this.horizontalSign;
    this.y = (top - bottom) / (2 * this.scale);
  }
  zoom(factor: number, px: number, py: number, width: number, height: number) {
    const dx = (px - width / 2) * this.horizontalSign,
      dy = height / 2 - py;
    const before = this.scale;
    this.scale = Math.max(0.01, Math.min(1e7, this.scale * factor));
    this.x += dx / before - dx / this.scale;
    this.y += dy / before - dy / this.scale;
  }
  pan(dx: number, dy: number) {
    this.x -= (dx / this.scale) * this.horizontalSign;
    this.y += dy / this.scale;
  }
  worldPoint(
    px: number,
    py: number,
    width: number,
    height: number,
    bounds: Bounds,
  ): Point {
    return [
      (bounds.minX + bounds.maxX) / 2 +
        this.x +
        ((px - width / 2) / this.scale) * this.horizontalSign,
      (bounds.minY + bounds.maxY) / 2 + this.y + (height / 2 - py) / this.scale,
    ];
  }
}
