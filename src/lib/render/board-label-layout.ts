import { BoardDisplay } from "../board/display";
import type { BoardScene, Bounds, Point, Via } from "../board/model";
import { pinDisplayCategory } from "../board/shapes/pin";
import { SegmentShape } from "../board/shapes/segment";
import { ViaShape } from "../board/shapes/via";
import { ZoneShape } from "../board/shapes/zone";

import { type VisibilityOptions } from "../board/display";
import type { Camera } from "../interaction/camera";

import { BackdrillShape } from "../board/shapes/backdrill";
import type { AreaLabelIndex } from "./area-label-index";
import type { TrackLabelIndex } from "./track-label-index";
import { ViaLabelIndex } from "./via-label-index";

import { FontMetrics, LABEL_LAYOUT, type FontAtlas } from "./font-metrics";
export { LABEL_LAYOUT, type FontAtlas, type Glyph } from "./font-metrics";

export interface LabelOptions extends VisibilityOptions {
  trackNames: boolean;
  pinNames: boolean;
  viaNames: boolean;
  thruLabels: boolean;
  bbLabels: boolean;
  zoneNames: boolean;
  shapes: number;
}
export interface GlyphRun {
  target: number[];
  font: FontAtlas;
  text: string;
  center: Point;
  height: number;
  angle: number;
  color: readonly [red: number, green: number, blue: number, alpha: number];
  horizontalSign?: number;
  independentOpacity?: boolean;
  verticalScale?: number;
}

export interface BoardLabelLayoutInput {
  scene: BoardScene;
  font: FontAtlas;
  camera: Camera;
  width: number;
  height: number;
  options: LabelOptions;
  viaIndex?: ViaLabelIndex | null;
  trackIndex?: TrackLabelIndex | null;
  areaIndex?: AreaLabelIndex | null;
}

export class BoardLabelLayout {
  // Scene objects are immutable; weak keys let measurements go with a closed board.
  private static readonly viaLabelSizes = new WeakMap<Via, number>();
  private static viaLabelSize(via: Via) {
    let size = BoardLabelLayout.viaLabelSizes.get(via);
    if (size === undefined) {
      size = ViaLabelIndex.labelDiameter(via);
      BoardLabelLayout.viaLabelSizes.set(via, size);
    }
    return size;
  }
  /** Clip a segment's parameter interval, before enumerating repeated labels.
   * A tiny viewport must not visit every label along a kilometre-long segment. */
  static visibleSegmentInterval(
    a: Point,
    b: Point,
    bounds: Bounds,
  ): [number, number] | null {
    let first = 0,
      last = 1;
    for (const [origin, delta, min, max] of [
      [a[0], b[0] - a[0], bounds.minX, bounds.maxX],
      [a[1], b[1] - a[1], bounds.minY, bounds.maxY],
    ]) {
      if (delta === 0) {
        if (origin < min || origin > max) return null;
        continue;
      }
      const t0 = (min - origin) / delta,
        t1 = (max - origin) / delta;
      first = Math.max(first, Math.min(t0, t1));
      last = Math.min(last, Math.max(t0, t1));
      if (first > last) return null;
    }
    return [first, last];
  }
  /** Automatic labels cancel the camera's horizontal reflection locally.
   * Stored design text retains the board's reflection instead. */
  static appendGlyphs({
    target,
    font,
    text,
    center,
    height,
    angle,
    color,
    horizontalSign = 1,
    independentOpacity = false,
    verticalScale = 1,
  }: GlyphRun) {
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    let minY = Infinity,
      maxY = -Infinity;
    for (const ch of text) {
      if (ch === " ") continue;
      const g = font.glyphs[ch] ?? font.glyphs["?"];
      if (g.plane[2] <= g.plane[0] || g.plane[3] <= g.plane[1]) continue;
      minY = Math.min(minY, g.plane[1]);
      maxY = Math.max(maxY, g.plane[3]);
    }
    const verticalCenter = Number.isFinite(minY) ? (minY + maxY) / 2 : 0;
    let pen = (-FontMetrics.advance(font, text) * height) / 2;
    for (const ch of text) {
      const g = font.glyphs[ch] ?? font.glyphs["?"];
      if (ch !== " ") {
        const x = pen + g.plane[0] * height,
          y = (g.plane[1] - verticalCenter) * height * verticalScale;
        target.push(
          center[0] + (x * cos - y * sin) * horizontalSign,
          center[1] + x * sin + y * cos,
          (g.plane[2] - g.plane[0]) * height,
          (g.plane[3] - g.plane[1]) * height * verticalScale,
          ...g.uv,
          ...color,
          cos,
          sin,
          horizontalSign,
          (g.page ?? 0) * 2 + Number(independentOpacity),
        );
      }
      pen += g.advance * height;
    }
  }
  static layout({
    scene,
    font,
    camera,
    width,
    height,
    options,
    viaIndex,
    trackIndex,
    areaIndex,
  }: BoardLabelLayoutInput) {
    const ox = (scene.bounds.minX + scene.bounds.maxX) / 2,
      oy = (scene.bounds.minY + scene.bounds.maxY) / 2;
    const batches = new Map<string, number[]>();
    if (
      width <= 0 ||
      height <= 0 ||
      !Number.isFinite(camera.scale) ||
      camera.scale <= 0
    )
      return batches;
    const batch = (name: string) => {
      let values = batches.get(name);
      if (!values) {
        values = [];
        batches.set(name, values);
      }
      return values;
    };
    const visible = (x: number, y: number, pad = 0) =>
      Math.abs(x - ox - camera.x) <= width / 2 / camera.scale + pad &&
      Math.abs(y - oy - camera.y) <= height / 2 / camera.scale + pad;
    const view = {
      minX: ox + camera.x - (width / 2 + 2) / camera.scale,
      maxX: ox + camera.x + (width / 2 + 2) / camera.scale,
      minY: oy + camera.y - (height / 2 + 2) / camera.scale,
      maxY: oy + camera.y + (height / 2 + 2) / camera.scale,
    };
    if (options.trackNames)
      for (const s of trackIndex
        ? trackIndex.query(view, camera.scale)
        : scene.segments) {
        // NMJ FBA_CMD34: Allegro shows adjacent straight labels, but no label on
        // the confirmed arc at ~19/38/76 px widths. Do not invent curved labels.
        // Other arc configurations still need native comparison (see observations).
        const category = new SegmentShape(s).displayCategory();
        if (s.arc || !BoardDisplay.isVisible(options, s.layer, category))
          continue;
        const projected = s.width * camera.scale;
        if (projected < LABEL_LAYOUT.trackMinimumWidth) continue;
        const text = scene.nets.get(s.net);
        if (!text) continue;
        const length = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        if (length <= 0) continue;
        // PA14611 MIC_LED and short LDO12_1R8: glyphs keep growing with the
        // physical trace. Only segment length limits their size, not the viewport
        // or the screen-size cap used by copper shape labels.
        const nominal = s.width * LABEL_LAYOUT.trackHeightRatio;
        const advance = FontMetrics.advance(font, text),
          size = Math.min(nominal, (length * 0.85) / Math.max(advance, 1));
        if (size * camera.scale < LABEL_LAYOUT.minimumTextPixels) continue;
        const spacing = Math.max(
          advance * size + size * 3,
          LABEL_LAYOUT.trackMinimumSpacing / camera.scale,
        );
        const count = Math.max(1, Math.floor(length / spacing));
        const padding = advance * size + size;
        const range = BoardLabelLayout.visibleSegmentInterval(s.a, s.b, {
          minX: ox + camera.x - width / 2 / camera.scale - padding,
          maxX: ox + camera.x + width / 2 / camera.scale + padding,
          minY: oy + camera.y - height / 2 / camera.scale - padding,
          maxY: oy + camera.y + height / 2 / camera.scale + padding,
        });
        if (!range) continue;
        const first = Math.max(0, Math.ceil(range[0] * count - 0.5)),
          last = Math.min(count - 1, Math.floor(range[1] * count - 0.5));
        let angle = Math.atan2(
          s.b[1] - s.a[1],
          (s.b[0] - s.a[0]) * camera.horizontalSign,
        );
        if (angle > Math.PI / 2) angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;
        for (let i = first; i <= last; i++) {
          const t = (i + 0.5) / count,
            x = s.a[0] + (s.b[0] - s.a[0]) * t,
            y = s.a[1] + (s.b[1] - s.a[1]) * t;
          if (visible(x, y, advance * size))
            BoardLabelLayout.appendGlyphs({
              target: batch(`${category}:${s.layer}`),
              font,
              text,
              center: [x - ox, y - oy],
              height: size,
              angle,
              color: [0.95, 0.97, 1, 0.9],
              horizontalSign: camera.horizontalSign,
            });
        }
      }
    const viaCandidates = () =>
      viaIndex
        ? viaIndex.query(view, camera.scale, LABEL_LAYOUT.viaMinimumDiameter)
        : scene.vias;
    if (options.thruLabels || options.bbLabels || options.viaNames)
      for (const v of viaCandidates()) {
        const pad = BoardLabelLayout.viaLabelSize(v);
        if (!visible(...v.at, pad)) continue;
        if (
          !BoardDisplay.isDrillScopeVisible(
            options,
            new ViaShape(v).drillLayers(scene.layers.length),
          )
        )
          continue;
        const px = pad * camera.scale;
        if (px < LABEL_LAYOUT.viaMinimumDiameter) continue;
        const through = new ViaShape(v).isThrough(scene.layers.length);
        const validSpan =
          v.drill > 0 &&
          Number.isInteger(v.startLayer) &&
          Number.isInteger(v.endLayer) &&
          v.startLayer >= 0 &&
          v.endLayer > v.startLayer &&
          v.endLayer < scene.layers.length;
        const span = v.backdrill
          ? options.bbLabels
            ? new BackdrillShape(v.backdrill).label()
            : ""
          : validSpan && (through ? options.thruLabels : options.bbLabels)
            ? `${v.startLayer + 1}:${v.endLayer + 1}`
            : "";
        const name = options.viaNames ? (scene.nets.get(v.net) ?? "") : "";
        const nameFraction = v.backdrill ? (pad > v.drill ? 0.85 : 0.95) : 0.75;
        const nameSize = name
          ? Math.min(
              (pad * nameFraction) / FontMetrics.advance(font, name),
              pad * 0.4,
            )
          : 0;
        // 874 retains the long USB net name inside a ~64 px drill, below the normal
        // automatic-label threshold. Keep this calibration specific to backdrills.
        const showName =
          !!name &&
          nameSize * camera.scale >=
            (v.backdrill ? 4 : LABEL_LAYOUT.minimumTextPixels);
        // Allegro separates simultaneous labels vertically, but centers either alone.
        // Do not reserve a row for a name that is too small to actually draw.
        const offset = span && showName ? pad * 0.25 : 0;
        // Cyan BB span and neutral net text were observed in PA14611. These are
        // viewer defaults, not an inferred mapping from the active copper color.
        if (span)
          BoardLabelLayout.appendGlyphs({
            target: batch("drill"),
            font,
            text: span,
            center: [v.at[0] - ox, v.at[1] - oy + offset],
            height:
              (pad * (through ? 0.85 : 0.68)) / FontMetrics.advance(font, span),
            angle: 0,
            color: through ? [1, 1, 1, 1] : [0, 1, 1, 1],
            horizontalSign: camera.horizontalSign,
            independentOpacity: true,
          });
        if (showName)
          BoardLabelLayout.appendGlyphs({
            target: batch("drill"),
            font,
            text: name,
            center: [v.at[0] - ox, v.at[1] - oy - offset],
            height: nameSize,
            angle: 0,
            color: [1, 1, 1, 1],
            horizontalSign: camera.horizontalSign,
          });
      }
    if (options.pinNames)
      for (const pin of areaIndex
        ? areaIndex.queryPins(view, camera.scale)
        : scene.pins) {
        if (!visible(...pin.at, 1)) continue;
        const name = scene.nets.get(pin.net);
        if (!name) continue;
        const category = pinDisplayCategory(pin);
        for (const p of pin.shapes) {
          if (!BoardDisplay.isVisible(options, p.layer, category)) continue;
          const size = Math.min(
            (p.width * 0.85) / FontMetrics.advance(font, name),
            p.height * 0.65,
          );
          if (size * camera.scale < 8) continue;
          // Follow the pad axis, but keep the label readable from either side.
          let angle = Math.atan2(
            Math.sin(pin.angle),
            Math.cos(pin.angle) * camera.horizontalSign,
          );
          if (angle > Math.PI / 2) angle -= Math.PI;
          if (angle < -Math.PI / 2) angle += Math.PI;
          BoardLabelLayout.appendGlyphs({
            target: batch(`${category}:${p.layer}`),
            font,
            text: name,
            center: [
              pin.at[0] + p.offset[0] - ox,
              pin.at[1] + p.offset[1] - oy,
            ],
            height: size,
            angle,
            color: [1, 1, 1, 0.9],
            horizontalSign: camera.horizontalSign,
          });
        }
      }
    if (options.zoneNames && options.shapes > 0)
      for (const zone of areaIndex
        ? areaIndex.queryZones(view, camera.scale)
        : scene.zones) {
        if (!BoardDisplay.isVisible(options, zone.layer, "zone")) continue;
        const name = scene.nets.get(zone.net);
        if (!name) continue;
        const bounds = new ZoneShape(zone).bounds(),
          minX = bounds.minX - ox,
          minY = bounds.minY - oy,
          maxX = bounds.maxX - ox,
          maxY = bounds.maxY - oy;
        const left = camera.x - width / 2 / camera.scale,
          right = camera.x + width / 2 / camera.scale,
          bottom = camera.y - height / 2 / camera.scale,
          top = camera.y + height / 2 / camera.scale;
        if (maxX < left || minX > right || maxY < bottom || minY > top)
          continue;
        const x0 = Math.max(left, minX),
          x1 = Math.min(right, maxX),
          y0 = Math.max(bottom, minY),
          y1 = Math.min(top, maxY);
        const advance = Math.max(FontMetrics.advance(font, name), 1);
        // 874 GND: at fixed zoom, clipping the visible width from ~855 to ~595 px
        // shrinks the ink from ~166 to ~114 px. Full source bounds cannot set size.
        const pixels = Math.min(
          ((x1 - x0) * camera.scale * LABEL_LAYOUT.zoneViewportWidthRatio) /
            advance,
          height * LABEL_LAYOUT.zoneViewportHeightRatio,
        );
        if (pixels < LABEL_LAYOUT.zoneMinimumHeight) continue;
        const size = pixels / camera.scale;
        // Reserve a nominal line height between the three diagonal anchors. The
        // same 874 view retains labels at ~296 px tall but hides them at ~196 px;
        // this is a viewer calibration, not a recovered Allegro internal formula.
        if (size > (y1 - y0) / 4) continue;
        // Allegro SS8633A and DemoCase: a large copper area has three diagonal
        // screen-relative labels, not a repeating tile grid. Fit smaller areas to
        // their visible bounds; the stencil still clips text at edges and holes.
        for (const t of [0.25, 0.5, 0.75]) {
          // The viewport-relative pattern reflects on Flip_Y; keep its glyphs readable.
          const x = x0 + (x1 - x0) * t,
            y = y1 - (y1 - y0) * t;
          BoardLabelLayout.appendGlyphs({
            target: batch(`zone:${zone.id}`),
            font,
            text: name,
            center: [x, y],
            height: size,
            angle: 0,
            color: [0.88, 0.91, 0.94, 0.62 * options.shapes],
            horizontalSign: camera.horizontalSign,
            independentOpacity: true,
            verticalScale: LABEL_LAYOUT.zoneGlyphHeightRatio,
          });
        }
      }
    return batches;
  }
}
