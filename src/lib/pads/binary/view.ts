/** Checked little-endian access shared by PADS sections. Record layouts and
 * section membership stay in their readers; offsets are relative to this view. */
export class PadsBinaryView {
  constructor(
    private readonly view: DataView,
    private readonly field = "字段",
  ) {}

  range = (at: number, bytes: number): void => {
    if (
      !Number.isSafeInteger(at) ||
      !Number.isSafeInteger(bytes) ||
      at < 0 ||
      bytes < 0 ||
      at > this.view.byteLength - bytes
    )
      throw new Error(`PADS ${this.field}越界 ${at}+${bytes}`);
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
    if (!Number.isFinite(value)) throw new Error(`PADS 浮点值无效 ${at}`);
    return value;
  };
}
