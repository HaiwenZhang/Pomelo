/** Physical layer role shared by every supported board format. */
export type LayerFunction = "conductor" | "plane" | "dielectric" | "unknown";

/** Board-space coordinates and dimensions use millimetres. */
export type Point = [number, number];
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export interface Layer {
  id: number;
  name: string;
  color: string;
  layerFunction?: LayerFunction;
  sourceFlags?: number;
}

export interface BondWireInfo {
  profile: string;
  material?: string;
  sourcePin: number;
  finger: number;
  reference: string;
  pinName: string;
}

export interface Segment {
  id: number;
  trackId: number;
  layer: number;
  net: number;
  a: Point;
  b: Point;
  width: number;
  /** Angles are radians in board space; sweep retains its sign. */
  arc?: { center: Point; radius: number; start: number; sweep: number };
  bondWire?: BondWireInfo;
}

export interface DrillShape {
  readonly width: number;
  readonly height: number;
  readonly plated: boolean;
}
export interface BackdrillSpan {
  startLayer: number;
  stopLayer: number;
  protectedLayer: number;
}
export interface BackdrillDefinition {
  spans: BackdrillSpan[];
  displayDiameter: number;
  startPadDiameter: number;
  labelDiameter: number;
}
/** This source-specific rotation is stored in degrees; scene geometry uses radians elsewhere. */
export interface Backdrill extends BackdrillDefinition {
  sourceReference: number;
  rotationDegrees: number;
  mirrored: boolean;
}

export interface PadShape {
  layer: number;
  type: number;
  width: number;
  height: number;
  offset: Point;
  corner?: number;
  innerDiameter?: number;
  custom?: Point[][];
  customPaths?: Segment[][];
  backdrill?: boolean;
  backdrillBase?: boolean;
}

export interface Via {
  id: number;
  net: number;
  at: Point;
  padstack: number;
  padstackName?: string;
  drill: number;
  drillShape?: DrillShape;
  startLayer: number;
  endLayer: number;
  pads: PadShape[];
  backdrill?: Backdrill;
  stackupRegion?: { sourceReference: number; code: number };
  /** Radians in board space. */
  angle?: number;
  back?: boolean;
  finger?: { reference: string; name: string; sourcePin?: number };
}

export interface Pin {
  id: number;
  net: number;
  name: string;
  reference: string;
  at: Point;
  /** Radians in board space. */
  angle: number;
  back: boolean;
  drill: number;
  drillShape?: DrillShape;
  shapes: PadShape[];
  stackupRegion?: { sourceReference: number; code: number };
  die?: { sourceReference: number; padstackName: string };
}

export interface CopperChunk {
  start: number;
  count: number;
  bounds: Bounds;
  ringStart?: number;
  ringCount?: number;
}

export interface Zone {
  id: number;
  layer: number;
  net: number;
  paths: Segment[][];
  rings: Point[][];
  points: Float64Array;
  indices: Uint32Array;
  outerCount?: number;
  ringOffsets?: Uint32Array;
  /** Sorted vertex indices whose outgoing edges are zero-area contour bridges. */
  boundaryBreaks?: Uint32Array;
  holeChunks?: CopperChunk[];
  ringBounds?: Float64Array;
  ringOrder?: Uint32Array;
  curved?: boolean;
}

export interface BoardText {
  id: number;
  /** Placed symbol owning this text; coordinates are already board-absolute. */
  ownerId?: number;
  layer: number;
  classId: number;
  subclass: number;
  text: string;
  at: Point;
  /** Radians in board space. */
  angle: number;
  mirrored: boolean;
  align: "left" | "right" | "center";
  fontIndex: number;
  width: number;
  height: number;
  spacing: number;
  lineSpacing: number;
  strokeWidth: number;
}

export interface DrawingLayer extends Layer {
  defaultVisible: boolean;
}
export interface BoardDrawing {
  id: number;
  layer: number;
  net: 0;
  ownerId?: number;
  graphicIds: number[];
  segments: Segment[];
  /** References to scene.texts, drawn once normally and together on selection. */
  texts: BoardText[];
}

// Drawing layers and special layers are visual categories, not physical stackup layers.
export type SpecialLayer = Layer &
  (
    | { kind: "die-pad"; category: "etch" }
    | { kind: "bond-wire"; category: "bond-wire" }
    | { kind: "graphic"; category: "etch" }
  );

export interface BoardScene {
  layers: Layer[];
  specialLayers?: SpecialLayer[];
  nets: Map<number, string>;
  segments: Segment[];
  vias: Via[];
  pins: Pin[];
  zones: Zone[];
  outline: Segment[];
  texts: BoardText[];
  drawingLayers: DrawingLayer[];
  drawings?: BoardDrawing[];
  bounds: Bounds;
  diagnostics: string[];
}

export interface SceneBuildEvent {
  stage: string;
  event: "start" | "end";
  ms?: number;
  id?: number;
  rings?: number;
  vertices?: number;
  triangles?: number;
}
