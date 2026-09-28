import type { DrawingLayer } from "./model";
export type LayerCategory = "etch" | "via" | "pin" | "bond-wire";
export type DisplayCategory =
  | LayerCategory
  | "zone"
  | "zone-outline"
  | "drill"
  | "outline"
  | "drawing"
  | "text";
export type LayerVisibility = Partial<Record<LayerCategory, boolean>>;
export interface LayerPriority {
  layer: number;
  category: LayerCategory | "text";
}
export interface DisplayOrder {
  activeLayer: number | null;
  /** Front to back; independent from the physical stack and visibility. */
  priorities: readonly LayerPriority[];
}
export interface VisibilityOptions {
  hidden?: ReadonlySet<number>;
  layerVisibility?: ReadonlyMap<number, LayerVisibility>;
  vias?: boolean;
  pins?: boolean;
  drills?: boolean;
  boardText?: boolean;
  backdrills?: boolean;
}
export interface DisplayOptions extends VisibilityOptions, DisplayOrder {
  hidden: Set<number>;
  layerVisibility: ReadonlyMap<number, LayerVisibility>;
  vias: boolean;
  pins: boolean;
  drills: boolean;
  boardText: boolean;
  filled: boolean;
  opacity: number;
  shapes: number;
  trackNames: boolean;
  pinNames: boolean;
  viaNames: boolean;
  thruLabels: boolean;
  bbLabels: boolean;
  zoneNames: boolean;
}
/** Shared visibility and ordering policy for rendering, labels and picking. */
export class BoardDisplay {
  static createDisplayOptions(
    drawingLayers: readonly DrawingLayer[] = [],
  ): DisplayOptions {
    return {
      activeLayer: null,
      priorities: [],
      hidden: new Set(
        drawingLayers
          .filter((layer) => !layer.defaultVisible)
          .map((layer) => layer.id),
      ),
      layerVisibility: new Map(),
      vias: true,
      pins: true,
      drills: true,
      boardText: false,
      backdrills: true,
      filled: true,
      opacity: 1,
      shapes: 0.25,
      trackNames: true,
      pinNames: true,
      viaNames: false,
      thruLabels: true,
      bbLabels: true,
      zoneNames: true,
    };
  }
  /** Copper text and both parts of a shape follow their Etch priority. */
  static displayGroup(
    layer: number,
    category: DisplayCategory,
  ): DisplayCategory {
    if (category === "drawing") return "text";
    return category === "zone" ||
      category === "zone-outline" ||
      (category === "text" && layer >= 0 && layer < 0x10000)
      ? "etch"
      : category;
  }
  /** Back to front submission order. This never edits physical layers or geometry.
   * TOP before L3 and active Etch overriding manual priority were observed in Allegro.
   * Other default class relationships remain a viewer policy pending calibration. */
  static orderBatches<
    T extends {
      layer: number;
      category: DisplayCategory;
    },
  >(batches: readonly T[], order: DisplayOrder): T[] {
    const rank = BoardDisplay.createDisplayRank(order);
    return batches
      .map((batch, index) => ({ batch, index, rank: rank(batch) }))
      .sort((a, b) => {
        for (let i = 0; i < a.rank.length; i++)
          if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i];
        return a.index - b.index;
      })
      .map((item) => item.batch);
  }
  /** Cache the small set of display groups, not every object in a large net. */
  static createDisplayRank(order: DisplayOrder) {
    const priority = new Map<string, number>();
    order.priorities.forEach((item, index) => {
      const key = `${BoardDisplay.displayGroup(item.layer, item.category)}:${item.layer}`;
      if (!priority.has(key))
        priority.set(key, order.priorities.length - index);
    });
    const defaults: Record<DisplayCategory, number> = {
      outline: 0,
      text: 1,
      drawing: 1,
      zone: 2,
      "zone-outline": 2,
      etch: 2,
      "bond-wire": 2,
      pin: 3,
      via: 4,
      drill: 5,
    };
    const parts: Record<DisplayCategory, number> = {
      zone: 0,
      "zone-outline": 1,
      etch: 2,
      "bond-wire": 2,
      text: 3,
      drawing: 2,
      pin: 0,
      via: 0,
      drill: 0,
      outline: 0,
    };
    const cache = new Map<string, number[]>();
    return (batch: { layer: number; category: DisplayCategory }) => {
      const key = `${batch.layer}:${batch.category}`,
        cached = cache.get(key);
      if (cached) return cached;
      const group = BoardDisplay.displayGroup(batch.layer, batch.category);
      const promoted = priority.get(`${group}:${batch.layer}`) ?? 0;
      const active =
        order.activeLayer !== null &&
        batch.layer === order.activeLayer &&
        group === "etch";
      const result = [
        active ? 2 : promoted ? 1 : 0,
        promoted,
        defaults[group],
        -batch.layer,
        parts[batch.category],
      ];
      cache.set(key, result);
      return result;
    };
  }
  /** Shared by geometry, label candidates and picking. Drill marks have no copper layer. */
  static isVisible(
    options: VisibilityOptions,
    layer: number,
    category: DisplayCategory,
  ): boolean {
    if (category === "drill") return options.drills !== false;
    if (layer >= 0 && options.hidden?.has(layer)) return false;
    if (category === "via" && options.vias === false) return false;
    if (category === "pin" && options.pins === false) return false;
    if (category === "text" && options.boardText === false) return false;
    const group = BoardDisplay.displayGroup(layer, category);
    return (
      !["etch", "via", "pin", "bond-wire"].includes(group) ||
      options.layerVisibility?.get(layer)?.[group as LayerCategory] !== false
    );
  }
  static setLayerVisibility(
    options: DisplayOptions,
    layer: number,
    category: LayerCategory,
    visible: boolean,
  ): DisplayOptions {
    const layerVisibility = new Map(options.layerVisibility);
    layerVisibility.set(layer, {
      ...layerVisibility.get(layer),
      [category]: visible,
    });
    return { ...options, layerVisibility };
  }
  static isBatchVisible(
    options: DisplayOptions,
    batch: {
      layer: number;
      category: DisplayCategory;
      padMode?: "filled" | "outline";
      viaLayers?: readonly number[];
      backdrill?: boolean;
      backdrillBase?: boolean;
    },
    highlight = false,
  ): boolean {
    if (batch.backdrillBase && options.backdrills !== false) return false;
    if (
      batch.backdrill
        ? options.backdrills === false
        : !BoardDisplay.isVisible(options, batch.layer, batch.category)
    )
      return false;
    if (!BoardDisplay.isDrillScopeVisible(options, batch.viaLayers))
      return false;
    if (batch.padMode === "filled") return options.filled;
    if (batch.padMode === "outline") return highlight || !options.filled;
    return true;
  }
  /** No scope means an independent pin drill. Labels use this without
   * the drill-center switch; hiding a center does not disable embedded names. */
  static isDrillScopeVisible(
    options: VisibilityOptions,
    viaLayers?: readonly number[],
  ) {
    return (
      viaLayers === undefined ||
      viaLayers.some((layer) => BoardDisplay.isVisible(options, layer, "via"))
    );
  }
}
