import type { DefinitionTableRecord } from "./records/definitions";
import type { LayerListRecord } from "./records/layers";
import type { PadstackRecord } from "./records/padstacks";
import type { PropertyRecord } from "./records/properties";
import type { TextGraphicRecord } from "./records/text";

/** Unmodeled payloads remain opaque; consumers must narrow fields before use. */
export type RawRecord = Record<string, unknown>;
export type OpaqueRecord = RawRecord & {
  type: number;
  offset: number;
  Key?: number;
  Next?: number;
};
export type IndexedRecord = OpaqueRecord & { Key: number };

export interface ArcBody {
  UnknownByte: number;
  SubType: number;
  Key: number;
  Next: number;
  Parent: number;
  Unknown1: number;
  Unknown6?: number;
  Width: number;
  StartX: number;
  StartY: number;
  EndX: number;
  EndY: number;
  CenterX: number;
  CenterY: number;
  Radius: number;
  BoundingBoxCoords: number[];
}

export interface FootprintRectangleBody {
  T: number;
  Layer: number;
  Key: number;
  Next: number;
  FpPtr: number;
  Unknown1: number;
  Unknown2: number;
  Unknown3?: number;
  Unknown4?: number;
  Unknown5?: number;
  Coords: number[];
  UnknownArr: number[];
  Rotation: number;
}

export interface GraphicBody {
  Type: number;
  Layer: number;
  Key: number;
  Next: number;
  Parent: number;
  Flags: number;
  Unknown2?: number;
  SegmentPtr: number;
  Ptr0x03: number;
  Ptr0x26: number;
}

export interface SegmentBody {
  Key: number;
  Next: number;
  Parent: number;
  Flags: number;
  Unknown2?: number;
  Width: number;
  StartX: number;
  StartY: number;
  EndX: number;
  EndY: number;
}

export interface RectangleBody {
  Type: number;
  Layer: number;
  Key: number;
  Next: number;
  Parent: number;
  Unknown1: number;
  Unknown2?: number;
  Coords: number[];
  Ptr2: number;
  Unknown3: number;
  Unknown4: number;
  Rotation: number;
}

export interface ShapeBody {
  Type: number;
  Layer: number;
  Key: number;
  Next: number;
  Ptr1: number;
  Unknown1: number;
  Unknown2?: number;
  Unknown3?: number;
  Ptr2: number;
  Ptr3: number;
  FirstKeepoutPtr: number;
  FirstSegmentPtr: number;
  Unknown4: number;
  Unknown5: number;
  TablePtr?: number;
  Ptr6: number;
  TablePtr_16x?: number;
  Coords: number[];
}

export interface KeepoutBody {
  T: number;
  Layer: number;
  Key: number;
  Next: number;
  Ptr1: number;
  Unknown1?: number;
  Flags: number;
  FirstSegmentPtr: number;
  Ptr3: number;
  Unknown2: number;
}

export interface NetAssignmentBody {
  Type: number;
  R: number;
  Key: number;
  Next: number;
  Net: number;
  ConnItem: number;
  Unknown?: number;
}

export interface TrackBody {
  Layer: number;
  Key: number;
  Next: number;
  NetAssignment: number;
  UnknownPtr1: number;
  Unknown2?: number;
  Unknown3?: number;
  UnknownPtr2a: number;
  UnknownPtr2b: number;
  Unknown4?: number;
  UnknownPtr3a: number;
  UnknownPtr3b: number;
  Unknown5a?: number;
  Unknown5b?: number;
  FirstSegPtr: number;
  UnknownPtr5: number;
  Unknown6: number;
}

export interface NetBody {
  Key: number;
  Next: number;
  NetName: number;
  Unknown1?: number;
  Unknown2?: number;
  Type: number;
  Assignment: number;
  Ratline: number;
  FieldsPtr: number;
  MatchGroupPtr: number;
  ModelPtr: number;
  UnknownPtr4: number;
  UnknownPtr5: number;
  UnknownPtr6: number;
}

export interface PadBody {
  Key: number;
  Name?: string;
  NameStrId?: number;
  Next: number;
  Unknown1?: number;
  CoordsX: number;
  CoordsY: number;
  PadStack: number;
  Unknown2: number;
  Unknown3?: number;
  Flags: number;
  Rotation: number;
}

export interface PlacedPadBody {
  Type: number;
  Layer: number;
  Key: number;
  Next: number;
  NetPtr: number;
  Flags: number;
  Prev?: number;
  NextInFp: number;
  ParentFp: number;
  Track: number;
  PadPtr: number;
  Ptr6: number;
  Ratline: number;
  PtrPinNumber: number;
  NextInCompInst: number;
  Unknown2?: number;
  NameText: number;
  Ptr11: number;
  Coords: number[];
}

export interface ViaBody {
  LayerInfo: number;
  Key: number;
  Next: number;
  NetPtr: number;
  Unknown2?: number;
  Unknown3?: number;
  UnknownPtr1: number;
  UnknownPtr2?: number;
  CoordsX: number;
  CoordsY: number;
  Connection: number;
  Padstack: number;
  UnknownPtr5: number;
  UnknownPtr6: number;
  Unknown4: number;
  Unknown5: number;
  BoundingBoxCoords: number[];
}

export interface ComponentInstanceBody {
  Key: number;
  RefDes?: string;
  Next: number;
  FpInstPtr: number;
  FunctionInstPtr: number;
  X03Ptr: number;
  Unknown5: number;
  FirstPadPtr: number;
  UnknownPtr1?: number;
  Unknown2?: number;
  Unknown3?: number;
  Unknown4?: number;
  RefDesStrPtr?: number;
}

export interface FootprintDefinitionBody {
  Key: number;
  FpStrRef: number;
  Unknown1: number;
  Coords: number[];
  Next: number;
  FirstInstPtr: number;
  UnknownPtr3: number;
  UnknownPtr4: number;
  UnknownPtr5: number;
  FieldsPtr: number;
  UnknownPtr6: number;
  UnknownPtr7: number;
  UnknownPtr8: number;
  Unknown2?: number;
  Unknown3?: number;
}

export interface FootprintInstanceBody {
  UnknownByte1: number;
  Layer: number;
  UnknownByte2: number;
  Key: number;
  Flags: number;
  Rotation: number;
  CoordX: number;
  CoordY: number;
  Next: number;
  InstRef16x?: number;
  GraphicPtr: number;
  FirstPadPtr: number;
  TextPtr: number;
  AssemblyPtr: number;
  AreasPtr: number;
  UnknownPtr1: number;
  UnknownPtr2: number;
  Unknown1?: number;
  Unknown2?: number;
  Unknown3?: number;
  Unknown4?: number;
  InstRef?: number;
}

export interface HatchLinkBody {
  Type: number;
  R: number;
  Key: number;
  Next: number;
  UnknownArray1: number[];
  UnknownArray2?: number[];
}

export interface PadstackReferenceBody {
  Type: number;
  T2: number;
  Key: number;
  UnknownArray: number[];
}

export interface TextWrapperBody {
  Type: number;
  Layer: number;
  Key: number;
  Next: number;
  Unknown4?: number;
  Rotation: number;
  Font16x?: number;
  CoordsX: number;
  CoordsY: number;
  StrGraphicPtr: number;
  PtrGroup_16x?: number;
  Unknown1?: number;
  Unknown2?: number;
  Font?: number;
  Ptr1?: number;
  Unknown3?: number;
  PtrGroup_17x?: number;
  Ptr2?: number;
  Unknown5?: number;
}

export interface FieldBody {
  Hdr1: number;
  Key: number;
  Next: number;
  SubType: number;
  Size: number;
  Value?: string | number | number[];
  PayloadKind?: "dimension-settings";
  ValueBytes?: Uint8Array;
  Words?: number[];
}

export interface PointerArrayBody {
  T: number;
  T2: number;
  Key: number;
  GroupPtr: number;
  Next: number;
  Capacity: number;
  Count: number;
  Unknown2: number;
  Unknown3?: number;
  Ptrs: number[];
}

/** Body contracts for the records consumed by scene builders and resolvers. */
export interface RecordBodies {
  0x01: ArcBody;
  0x03: FieldBody;
  0x04: NetAssignmentBody;
  0x05: TrackBody;
  0x07: ComponentInstanceBody;
  0x0d: PadBody;
  0x0e: FootprintRectangleBody;
  0x14: GraphicBody;
  0x15: SegmentBody;
  0x16: SegmentBody;
  0x17: SegmentBody;
  0x1b: NetBody;
  0x1c: PadstackRecord;
  0x20: HatchLinkBody;
  0x24: RectangleBody;
  0x28: ShapeBody;
  0x2a: LayerListRecord;
  0x2b: FootprintDefinitionBody;
  0x2d: FootprintInstanceBody & { InstRef: number };
  0x2f: PadstackReferenceBody;
  0x30: TextWrapperBody;
  0x31: TextGraphicRecord;
  0x32: PlacedPadBody;
  0x33: ViaBody;
  0x34: KeepoutBody;
  0x36: DefinitionTableRecord;
  0x37: PointerArrayBody;
  0x3b: PropertyRecord;
}

export type KnownRecordType = keyof RecordBodies;
export type AllegroRecord<T extends KnownRecordType = KnownRecordType> = {
  [K in T]: RecordBodies[K] & { type: K; offset: number };
}[T];

export type RecordLookup = (key: number) => { type: number } | undefined;

export function lookupRecord<T extends KnownRecordType>(
  lookup: RecordLookup,
  key: number | undefined,
  expected: T,
): AllegroRecord<T> | undefined {
  if (key === undefined) return undefined;
  const value = lookup(key);
  return isRecordType(value, expected) ? value : undefined;
}

/** Check the tag of an already decoded record; byte-layout validation belongs to readers. */
export function isRecordType<T extends KnownRecordType>(
  value: unknown,
  expected: T | readonly T[],
): value is AllegroRecord<T> {
  if (typeof value !== "object" || value === null || !("type" in value))
    return false;
  return typeof expected === "number"
    ? value.type === expected
    : expected.some((tag) => value.type === tag);
}
