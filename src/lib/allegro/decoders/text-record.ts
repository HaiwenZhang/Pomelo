import type { BoardText } from "../../board/model";
import type { FontDefinition } from "../binary/records/definitions";
import { isUint32 } from "../binary/record-values";
type TextWrapperFields = {
  Key?: unknown;
  Layer?: unknown;
  Font?: unknown;
  Font16x?: unknown;
  CoordsX?: unknown;
  CoordsY?: unknown;
  Rotation?: unknown;
};
type TextGraphicFields = { Value?: unknown };
export class AllegroTextRecordDecoder {
  constructor(readonly scale: number) {}
  decode(
    wrapper: TextWrapperFields,
    graphic: TextGraphicFields,
    font: FontDefinition,
  ): BoardText {
    const scale = this.scale;
    const {
      Key: id,
      Layer: layer,
      CoordsX: x,
      CoordsY: y,
      Rotation: rotation,
    } = wrapper;
    const props = wrapper.Font ?? wrapper.Font16x;
    if (
      !isUint32(id) ||
      !isUint32(layer) ||
      layer > 0xffff ||
      typeof x !== "number" ||
      !Number.isFinite(x) ||
      typeof y !== "number" ||
      !Number.isFinite(y) ||
      typeof rotation !== "number" ||
      !Number.isFinite(rotation) ||
      !isUint32(props) ||
      typeof graphic.Value !== "string"
    )
      throw new Error(`Allegro 文字记录字段无效 ${id}`);
    const fontIndex = props & 255,
      alignment = (props >>> 16) & 255,
      reversal = props >>> 24;
    return {
      id,
      layer: (layer & 255) === 6 ? layer >>> 8 : 0x10000 + layer,
      classId: layer & 255,
      subclass: layer >>> 8,
      text: graphic.Value,
      at: [(x | 0) * scale, (y | 0) * scale],
      angle: (rotation * Math.PI) / 180000,
      mirrored: reversal === 1 || reversal === 3,
      align: alignment === 2 ? "right" : alignment === 3 ? "center" : "left",
      fontIndex,
      width: font.Width * scale,
      height: font.Height * scale,
      spacing: font.CharacterSpace * scale,
      lineSpacing: font.LineSpace * scale,
      strokeWidth: font.StrokeWidth * scale,
    };
  }
}
