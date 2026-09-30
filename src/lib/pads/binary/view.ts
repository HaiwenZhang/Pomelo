import { ParserError } from "../../parser-error";

const fieldErrors = {
  数据: "padsOutOfBounds",
  字段: "padsFieldOutOfBounds",
  封装字段: "padsFootprintFieldOutOfBounds",
  焊盘字段: "padsPadFieldOutOfBounds",
  接点字段: "padsJunctionFieldOutOfBounds",
  走线字段: "padsRouteFieldOutOfBounds",
  铺铜字段: "padsPourFieldRange",
  连接字段: "padsConnectionFieldRange",
} as const;

/** Checked little-endian access shared by PADS sections. Record layouts and
 * section membership stay in their readers; offsets are relative to this view. */
export class PadsBinaryView {
  constructor(
    private readonly view: DataView,
    private readonly field: keyof typeof fieldErrors = "字段",
  ) {}

  range = (at: number, bytes: number): void => {
    if (
      !Number.isSafeInteger(at) ||
      !Number.isSafeInteger(bytes) ||
      at < 0 ||
      bytes < 0 ||
      at > this.view.byteLength - bytes
    ) {
      const detail = `${at}+${bytes}/${this.view.byteLength}`;
      throw new ParserError(
        fieldErrors[this.field],
        this.field === "数据"
          ? { detail: at, value: bytes, extra: this.view.byteLength }
          : { detail },
        `PADS ${this.field}越界 ${detail}`,
      );
    }
  };
  u8 = (at: number): number => {
    this.range(at, 1);
    return this.view.getUint8(at);
  };
  u32 = (at: number): number => {
    this.range(at, 4);
    return this.view.getUint32(at, true);
  };
  i32 = (at: number): number => {
    this.range(at, 4);
    return this.view.getInt32(at, true);
  };
  f32 = (at: number): number => {
    this.range(at, 4);
    const value = this.view.getFloat32(at, true);
    if (!Number.isFinite(value))
      throw new ParserError(
        "padsInvalidFloat",
        { detail: at },
        `PADS 浮点值无效 ${at}`,
      );
    return value;
  };
}
