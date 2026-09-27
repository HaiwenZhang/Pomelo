import type { Bounds, CopperChunk } from "../board/model";
import type { DisplayCategory } from "../board/display";

/** One CPU packet ready for GPU upload, with its drawing metadata. */
export interface PrimitiveBatch {
  layer: number;
  category: DisplayCategory;
  data: Float32Array;
  residual: Float32Array;
  indices?: Uint32Array;
  color?: Float32Array;
  bounds?: Bounds;
  holeChunks?: CopperChunk[];
  triangles?: boolean;
  arcs?: boolean;
  padMode?: "filled" | "outline";
  zones?: {
    id: number;
    start: number;
    count: number;
    outerCount?: number;
    bounds?: Bounds;
  }[];
  outlines?: { id: number; start: number; count: number }[];
  /** Empty-data selection marker: borrow these zones' existing GPU outlines. */
  outlineRefs?: number[];
  viaLayers?: readonly number[];
  backdrill?: boolean;
  backdrillBase?: boolean;
}
