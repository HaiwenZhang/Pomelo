import { expect, test } from "vitest";
import { Camera } from "../../src/lib/interaction/camera";
import {
  canvasBoardPoint,
  coordinateUnit,
  formatCursorPoint,
  scaleBarSize,
} from "../../src/lib/interaction/cursor-coordinate";

const bounds = { minX: 100, minY: 200, maxX: 120, maxY: 220 };
const rect = { left: 10, top: 20, width: 200, height: 100 };

test("cursor position uses canvas offset and current camera orientation", () => {
  const camera = new Camera();
  camera.scale = 10;
  expect(canvasBoardPoint(camera, bounds, rect, 160, 45)).toEqual([115, 212.5]);
  camera.flipped = true;
  expect(canvasBoardPoint(camera, bounds, rect, 160, 45)).toEqual([105, 212.5]);
});

test("cursor coordinates clear outside the canvas or without a board", () => {
  const camera = new Camera();
  expect(canvasBoardPoint(camera, null, rect, 110, 70)).toBeNull();
  expect(canvasBoardPoint(camera, bounds, rect, 211, 70)).toBeNull();
  expect(canvasBoardPoint(camera, bounds, rect, 110, 19)).toBeNull();
});

test("cursor display converts millimeter scene positions into the loaded board unit", () => {
  expect(formatCursorPoint([25.4, -12.7], coordinateUnit("brd", 1), "en")).toBe(
    "X: 1,000.000  Y: -500.000 mil",
  );
  expect(
    formatCursorPoint([25.4, -12.7], coordinateUnit("odb", "INCH"), "en"),
  ).toBe("X: 1.00000  Y: -0.50000 in");
  expect(formatCursorPoint([25.4, -12.7], coordinateUnit("kicad"), "en")).toBe(
    "X: 25.400  Y: -12.700 mm",
  );
});

test("source coordinate unit follows the other supported PCB formats", () => {
  expect(coordinateUnit("brd", 3).label).toBe("mm");
  expect(coordinateUnit("brd", 4).label).toBe("cm");
  expect(coordinateUnit("brd", 5).label).toBe("µm");
  expect(coordinateUnit("odb", "MM").label).toBe("mm");
  expect(coordinateUnit("pads").label).toBe("mil");
  expect(coordinateUnit("altium").label).toBe("mil");
  expect(coordinateUnit("hfss").label).toBe("mm");
});

test("scale bar length uses the loaded board unit", () => {
  expect(scaleBarSize(10, coordinateUnit("brd", 1))).toEqual({
    length: 200,
    width: 50.8,
  });
  expect(scaleBarSize(10, coordinateUnit("brd", 3))).toEqual({
    length: 5,
    width: 50,
  });
});
