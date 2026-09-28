import type { DrillShape, PadShape, Point, Segment } from "../../board/model";
import { PadShape as PadGeometry } from "../../board/shapes/pad";
import { PathShape } from "../../board/shapes/path";
import { AllegroDrillDecoder } from "./drill";
import type { AllegroGeometryDecoder } from "./geometry";
import { parserError } from "../../parser-error";
type PadComponentFields = {
  Type?: unknown;
  W?: unknown;
  H?: unknown;
  Z1?: unknown;
  ShapePtr?: unknown;
};
type DrillStackFields = {
  Key?: unknown;
  DrillSize?: unknown;
  SlotX?: unknown;
  SlotY?: unknown;
  Flags?: unknown;
  Plated?: unknown;
  NumFixedCompEntries?: unknown;
  Components?: unknown;
};
/** One build owns these source-ID caches; placement never mutates a cached definition. */
export class AllegroPadDecoder {
  private readonly customShapes = new Map<
    number,
    {
      rings: Point[][];
      paths: Segment[][];
    }
  >();
  private readonly drillDefinitions = new Map<number, DrillShape>();
  private readonly reported = new Set<string>();
  private readonly drillDecoder: AllegroDrillDecoder;
  constructor(
    private readonly geometry: AllegroGeometryDecoder,
    private readonly scale: number,
    private readonly diagnostics: string[],
  ) {
    this.drillDecoder = new AllegroDrillDecoder(scale);
  }
  private report(message: string): void {
    if (this.reported.has(message)) return;
    this.reported.add(message);
    this.diagnostics.push(message);
  }
  shape(
    p: PadComponentFields,
    layer: number,
    offset: Point,
    stack: number,
  ): PadShape | null {
    const scale = this.scale;
    if (!p.Type) return null;
    if (typeof p.Type !== "number") {
      this.report(`Padstack ${stack} 的焊盘类型无效`);
      return null;
    }
    const type = p.Type;
    const rawWidth = p.W;
    const rawHeight = [2, 5, 25].includes(type) ? rawWidth : p.H;
    if (typeof rawWidth !== "number" || typeof rawHeight !== "number") {
      this.report(`Padstack ${stack} 的类型 ${type} 焊盘尺寸无效`);
      return null;
    }
    // Allegro PAD184–188: a zero-width rectangle remains in the definition,
    // but Design Layers reports None and its preview contains no copper.
    // Keep the source record; do not invent a minimum-size rendered pad.
    if (
      type === 6 &&
      Number.isFinite(rawWidth) &&
      Number.isFinite(rawHeight) &&
      rawWidth >= 0 &&
      rawHeight >= 0 &&
      (rawWidth === 0 || rawHeight === 0)
    )
      return null;
    const value: PadShape = {
      layer,
      type,
      width: rawWidth * scale,
      height: rawHeight * scale,
      offset,
    };
    // Native DDR5 Padstack Editor: Donut Z1 is the inner diameter, independent
    // of DrillSize. Never replace the transparent inner region with a drill.
    const z1 = typeof p.Z1 === "number" ? p.Z1 : undefined;
    if (type === 25) {
      value.innerDiameter = (z1 ?? NaN) * scale;
      if (
        !Number.isFinite(value.innerDiameter) ||
        value.innerDiameter <= 0 ||
        value.innerDiameter >= value.width
      ) {
        this.report(`Padstack ${stack} 的圆环内外径无效`);
        return null;
      }
    } else value.corner = (z1 ?? 0) * scale;
    if (type === 22) {
      if (typeof p.ShapePtr !== "number" || !Number.isSafeInteger(p.ShapePtr)) {
        this.report(`Padstack ${stack} 的焊盘类型 22 缺少形状引用`);
        return null;
      }
      const shapePtr = p.ShapePtr;
      let geometry = this.customShapes.get(shapePtr);
      if (!geometry) {
        const parts = this.geometry
          .readShapePaths(shapePtr)
          .map((path) => ({ path, ring: new PathShape(path).flatten() }))
          .filter((part) => part.ring.length >= 3);
        geometry = {
          paths: parts.map((part) => part.path),
          rings: parts.map((part) => part.ring),
        };
        this.customShapes.set(shapePtr, geometry);
      }
      if (geometry.rings.length) {
        value.custom = geometry.rings;
        value.customPaths = geometry.paths;
        if (value.width <= 0 || value.height <= 0) {
          const b = new PadGeometry(value).bounds({
            at: [0, 0],
            angle: 0,
            back: false,
          });
          if (value.width <= 0) value.width = b.maxX - b.minX;
          if (value.height <= 0) value.height = b.maxY - b.minY;
        }
      }
    }
    if (!new PadGeometry(value).supported())
      this.report(
        `Padstack ${stack} 的焊盘类型 ${type} 尚无有效几何${type === 22 ? `（形状引用 ${p.ShapePtr}）` : ""}`,
      );
    if (
      !Number.isFinite(value.width) ||
      !Number.isFinite(value.height) ||
      value.width <= 0 ||
      value.height <= 0
    ) {
      this.report(`Padstack ${stack} 的类型 ${type} 焊盘尺寸无效`);
      return null;
    }
    return value;
  }
  drill(stack: DrillStackFields): DrillShape {
    const {
      Key: key,
      DrillSize: drillSize,
      SlotX: slotX,
      SlotY: slotY,
      Flags: flags,
      Plated: plated,
      NumFixedCompEntries: fixedEntries,
      Components: components,
    } = stack;
    if (
      typeof key !== "number" ||
      !Number.isSafeInteger(key) ||
      typeof drillSize !== "number" ||
      !Number.isFinite(drillSize) ||
      drillSize < 0 ||
      typeof slotX !== "number" ||
      !Number.isFinite(slotX) ||
      slotX < 0 ||
      typeof slotY !== "number" ||
      !Number.isFinite(slotY) ||
      slotY < 0 ||
      typeof flags !== "number" ||
      !Number.isSafeInteger(flags) ||
      (plated !== undefined && typeof plated !== "boolean") ||
      (fixedEntries !== undefined &&
        (typeof fixedEntries !== "number" ||
          !Number.isSafeInteger(fixedEntries))) ||
      !Array.isArray(components)
    )
      throw parserError("brdInvalidDrillField", { detail: String(key) });
    let value = this.drillDefinitions.get(key);
    if (!value) {
      value = this.drillDecoder.decode({
        DrillSize: drillSize,
        SlotX: slotX,
        SlotY: slotY,
        Flags: flags,
        Plated: plated,
        NumFixedCompEntries: fixedEntries,
        Components: components,
      });
      this.drillDefinitions.set(key, value);
    }
    return value;
  }
}
