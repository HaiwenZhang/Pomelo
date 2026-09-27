export class AllegroUnits {
  static toMillimeters(units: number, divisor: number) {
    const bases: Record<number, number> = {
      1: 0.0254,
      2: 25.4,
      3: 1,
      4: 10,
      5: 0.001,
    };
    if (!bases[units] || !divisor) throw new Error("不支持的板坐标单位");
    return bases[units] / divisor;
  }
}
