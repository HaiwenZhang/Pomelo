import type { DrawingLayer, LayerFunction } from "../../board/model";
const classes: Record<number, string> = {
  1: "板图",
  2: "器件值",
  3: "器件类型",
  4: "图框",
  7: "制造",
  9: "封装",
  13: "位号",
  16: "容差",
  17: "用户料号",
};
export const layerFunctionNames: Record<LayerFunction, string> = {
  conductor: "导体",
  plane: "平面",
  dielectric: "介质",
  unknown: "未分类",
};
export class AllegroLayerDecoder {
  /** 0x2A Properties flags, independent of names, positions and display order. */
  static functionFromFlags(properties: number | undefined): LayerFunction {
    if (properties === undefined) return "unknown";
    switch (properties & 0xc100) {
      case 0x8000:
        return "conductor";
      case 0x100:
        return "plane";
      case 0x4000:
        return "dielectric";
      default:
        return "unknown";
    }
  }
  static summary(
    layers: readonly {
      layerFunction?: LayerFunction;
    }[],
  ): string {
    const counts = { conductor: 0, plane: 0, dielectric: 0, unknown: 0 };
    for (const layer of layers) counts[layer.layerFunction ?? "unknown"]++;
    return (Object.keys(counts) as LayerFunction[])
      .filter((kind) => counts[kind])
      .map((kind) => `${counts[kind]} ${layerFunctionNames[kind]}层`)
      .join(" · ");
  }
  static drawingLayer(raw: number, customName?: string): DrawingLayer {
    const cls = raw & 255,
      sub = raw >>> 8;
    let name = `子层 ${sub}`,
      top = false,
      bottom = false;
    if ([2, 3, 13, 16, 17].includes(cls)) {
      const names: Record<number, string> = {
        248: "底面显示",
        249: "顶面显示",
        250: "底面丝印",
        251: "顶面丝印",
        252: "底面装配",
        253: "顶面装配",
      };
      name = names[sub] ?? name;
      top = sub === 251;
      bottom = sub === 250;
    } else if (cls === 1) {
      name =
        (
          {
            240: "底面丝印",
            241: "顶面丝印",
            237: "底面阻焊",
            238: "顶面阻焊",
            249: "尺寸",
            251: "装配说明",
            252: "电镀条",
          } as Record<number, string>
        )[sub] ?? name;
      top = sub === 241;
      bottom = sub === 240;
    } else if (cls === 9) {
      name =
        (
          {
            241: "底面显示",
            242: "顶面显示",
            243: "底面阻焊",
            244: "顶面阻焊",
            245: "器件中心",
            246: "底面丝印",
            247: "顶面丝印",
            248: "焊盘堆叠名称",
            249: "引脚编号",
            250: "底面放置边界",
            251: "顶面放置边界",
            252: "底面装配",
            253: "顶面装配",
          } as Record<number, string>
        )[sub] ?? name;
      top = sub === 247;
      bottom = sub === 246;
    }
    if (customName && sub < 0xe0) name = customName;
    return {
      id: 0x10000 + raw,
      name: `${classes[cls] ?? `类别 ${cls}`} · ${name}`,
      color: top ? "#dae6d9" : bottom ? "#c69adc" : "#a7a9bd",
      defaultVisible: top,
    };
  }
}
