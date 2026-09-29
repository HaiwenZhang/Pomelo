import type { Bounds, Point } from "../board/model";
import type { BoardFile } from "../import/model";
import type { Camera } from "./camera";

export interface CoordinateUnit {
  label: string;
  millimeters: number;
  digits: number;
}

const millimeters: CoordinateUnit = { label: "mm", millimeters: 1, digits: 3 };
const mils: CoordinateUnit = { label: "mil", millimeters: 0.0254, digits: 3 };
const inches: CoordinateUnit = { label: "in", millimeters: 25.4, digits: 5 };
const centimeters: CoordinateUnit = { label: "cm", millimeters: 10, digits: 4 };
const micrometers: CoordinateUnit = {
  label: "µm",
  millimeters: 0.001,
  digits: 1,
};
const formatters = new Map<string, Intl.NumberFormat>();

/** Scene geometry is in mm; choose the unit used by the source format. */
export function coordinateUnit(
  format: BoardFile["format"],
  sourceUnits?: number | string,
): CoordinateUnit {
  if (format === "odb") return sourceUnits === "INCH" ? inches : millimeters;
  if (format === "pads" || format === "altium") return mils;
  if (format === "brd" || format === undefined) {
    if (sourceUnits === 1) return mils;
    if (sourceUnits === 2) return inches;
    if (sourceUnits === 4) return centimeters;
    if (sourceUnits === 5) return micrometers;
  }
  // KiCad is metric; HFSS quantities may mix units, so the normalized scene unit applies.
  return millimeters;
}

export function formatCursorPoint(
  point: Point | null,
  unit: CoordinateUnit,
  locale: string,
): string {
  if (!point) return `X: —  Y: — ${unit.label}`;
  const key = `${locale}:${unit.digits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: unit.digits,
      maximumFractionDigits: unit.digits,
    });
    formatters.set(key, formatter);
  }
  const display = (value: number) => {
    const converted = value / unit.millimeters;
    return formatter.format(
      Math.abs(converted) < 0.5 * 10 ** -unit.digits ? 0 : converted,
    );
  };
  return `X: ${display(point[0])}  Y: ${display(point[1])} ${unit.label}`;
}

export function scaleBarSize(pixelsPerMm: number, unit: CoordinateUnit) {
  const pixelsPerUnit = pixelsPerMm * unit.millimeters;
  const power = 10 ** Math.floor(Math.log10(80 / pixelsPerUnit));
  const length =
    [5, 2, 1]
      .map((value) => value * power)
      .find((value) => value * pixelsPerUnit <= 110) ?? power;
  return { length, width: length * pixelsPerUnit };
}

export function canvasBoardPoint(
  camera: Camera,
  bounds: Bounds | null,
  rect: Pick<DOMRect, "left" | "top" | "width" | "height">,
  clientX: number,
  clientY: number,
): Point | null {
  if (
    !bounds ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    clientX < rect.left ||
    clientY < rect.top ||
    clientX >= rect.left + rect.width ||
    clientY >= rect.top + rect.height
  )
    return null;
  return camera.worldPoint(
    clientX - rect.left,
    clientY - rect.top,
    rect.width,
    rect.height,
    bounds,
  );
}
