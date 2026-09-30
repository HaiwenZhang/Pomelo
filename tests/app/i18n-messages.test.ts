import { test, expect } from "vitest";

import { createViewerI18n } from "../../src/i18n";
import {
  localizePhase,
  localizeError,
  localizeDiagnostic,
  localizeLayerSummary,
  localizeEncodingName,
} from "../../src/i18n/messages";

test("progress shown in English retains the parser stage and object count", () => {
  const translator = createViewerI18n("en");
  expect(localizePhase("解析对象 · 1,234", translator)).toBe(
    "Parsing objects · 1,234",
  );
  expect(localizePhase("读取 KiCad 走线与过孔", translator)).toBe(
    "Reading KiCad traces and vias",
  );
});

test("new languages localize parser progress and errors", () => {
  const traditional = createViewerI18n("zh-TW");
  const japanese = createViewerI18n("ja");
  expect(localizePhase("构建层与网络", traditional)).toBe("構建層與網路");
  expect(localizePhase("构建层与网络", japanese)).toBe(
    "レイヤーとネットを構築中",
  );
  expect(localizeError("KiCad 表达式未闭合", traditional)).toBe(
    "打開電路板失敗：KiCad 表達式未閉合",
  );
  expect(localizeError("KiCad 表达式未闭合", japanese)).toBe(
    "基板を開けませんでした: KiCad の式が閉じられていません",
  );
  expect(
    localizeDiagnostic("3 个设计铜区没有已保存填充，未重新铺铜", japanese),
  ).toBe(
    "設計上の銅箔領域 3 件に保存済みの塗りつぶしがなく、銅箔を再生成していません",
  );
  expect(localizeError("HFSS DEF 文件截断（偏移 0x20）", japanese)).toBe(
    "基板を開けませんでした: HFSS DEF ファイルが途中で切れています (オフセット 0x20)",
  );
});

test("build progress and dynamic format stages translate without losing counts or source names", () => {
  const translator = createViewerI18n("en");
  const examples = [
    ["构建层与网络", "Building layers and nets"],
    ["解析网络连接", "Resolving net connections"],
    ["构建走线", "Building traces"],
    ["读取 Padstack", "Reading padstacks"],
    ["构建过孔", "Building vias"],
    ["构建器件焊盘", "Building component pads"],
    ["构建铜皮", "Building copper areas"],
    ["构建板框", "Building board outline"],
    ["构建原始文字", "Building source text"],
    ["构建尺寸图形", "Building dimension graphics"],
    ["构建 PADS 铜区 · 16/40", "Building PADS copper areas · 16/40"],
    ["读取 ODB++ 图层 · TOP", "Reading ODB++ layer · TOP"],
  ] as const;
  for (const [source, translated] of examples)
    expect(localizePhase(source, translator)).toBe(translated);
});

test("known GPU errors translate, while unknown non-parser details remain visible", () => {
  const translator = createViewerI18n("en");
  expect(localizeError("未找到 WebGPU 图形设备", translator)).toBe(
    "No WebGPU graphics device was found",
  );
  expect(localizeError("device timeout", translator)).toBe(
    "Could not open this board: device timeout",
  );
  expect(localizeError("几何缓冲区超出设备上限：1024 / 512", translator)).toBe(
    "Geometry buffer exceeds the device limit: 1024 / 512",
  );
  expect(localizeError("扩展笔画字体数据无效", translator)).toBe(
    "Invalid extended stroke font data",
  );
});

test("parser failures retain their format and useful values in the selected language", () => {
  const english = createViewerI18n("en");
  const chinese = createViewerI18n("zh-CN");
  const examples = [
    ["暂不支持的 BRD 格式：0x1234", "Unsupported BRD format: 0x1234"],
    ["KiCad 表达式未闭合", "KiCad expression is not closed"],
    [
      "KiCad 多余右括号 @27",
      "KiCad has an extra closing parenthesis at byte 27",
    ],
    ["PADS 二进制签名无效", "Invalid PADS binary signature"],
    [
      "PADS 分节 14 记录尺寸不符",
      "PADS section 14 has a mismatched record size",
    ],
    ["ODB++ 缺少文件：matrix/matrix", "ODB++ is missing file: matrix/matrix"],
    ["HFSS 缺失网络 42", "HFSS is missing net 42"],
    ["Altium 复合文件标记无效", "Invalid Altium compound file signature"],
    ["未知记录类型 0x43", "Unknown BRD record type 0x43"],
    ["KiCad 字符串未闭合", "KiCad string is not closed"],
    [
      "KiCad segment 引用未知网络 42",
      "KiCad segment refers to undefined net 42",
    ],
    ["PADS 分页目录无效", "Invalid PADS page directory"],
    ["ODB++ TAR 缺少结束记录", "ODB++ TAR is missing its end record"],
    ["HFSS 属性块截断", "HFSS property block is truncated"],
    ["Altium FAT 数量无效", "Invalid Altium FAT count"],
    ["Altium 数据流截断", "Altium data stream is truncated"],
    ["Altium 铜层堆栈不足", "Altium copper stack has too few layers"],
    [
      "HFSS PolygonData 坐标数量无效",
      "HFSS PolygonData has an invalid coordinate count",
    ],
    ["ODB++ 孔洞没有所属岛", "ODB++ hole has no owning island"],
    ["PADS 铜区轮廓未闭合", "PADS copper area contour is not closed"],
    ["PADS 走线节点页组无效", "Invalid PADS route node page group"],
    ["PADS 重复引脚 1:2", "Duplicate PADS pin 1:2"],
    [
      "ODB++ 器件记录无效：components/comp:123",
      "Invalid ODB++ component record at components/comp:123",
    ],
    ["HFSS Padstack 定义无效 7", "Invalid HFSS padstack definition 7"],
    [
      "KiCad 铜区填充点数不足 @14",
      "KiCad copper fill has too few points at byte 14",
    ],
    [
      "Altium 板框顶点 2 坐标不完整",
      "Altium outline vertex 2 has incomplete coordinates",
    ],
    ["Altium Pad 4 主记录长度不足", "Altium Pad 4 main record is too short"],
    ["HFSS 空铜区 9", "HFSS copper area 9 is empty"],
    ["PADS Via 网络证据不一致 4", "PADS via 4 has inconsistent net evidence"],
    [
      "KiCad 图形圆弧 @42: Error: KiCad 圆弧半径或扫角无效",
      "Invalid KiCad graphic arc at byte 42",
    ],
    [
      "记录 #12，类型 0x43，偏移 0x80：Error: invalid field",
      "BRD record #12 of type 0x43 failed at offset 0x80",
    ],
    ["KiCad 焊盘尺寸无效 @42 0x0", "Invalid KiCad pad size at byte 42"],
    [
      "ODB++ EDA 引用了 matrix 中未定义的层：TOP",
      "ODB++ EDA refers to undefined matrix layer TOP",
    ],
    [
      "HFSS 属性语法无效：bad\nline",
      "Invalid HFSS property syntax near bad\nline",
    ],
  ] as const;
  for (const [source, translated] of examples) {
    expect(localizeError(source, chinese)).toBe(source);
    expect(localizeError(source, english)).toBe(
      `Could not open this board: ${translated}`,
    );
  }
});

test("unrecognized Chinese parser failures show a localized fallback", () => {
  const translator = createViewerI18n("en");
  expect(localizeError("未知字段 0x31", translator)).toBe(
    "Could not open this board: The board file contains invalid or unsupported data (0x31)",
  );
  expect(localizeError("PADS 未知未来特性", translator)).toBe(
    "Could not open this board: The PADS file contains invalid or unsupported data",
  );
});

test("HFSS DEF errors translate the reason and preserve its byte offset", () => {
  const translator = createViewerI18n("en");
  expect(localizeError("HFSS DEF 文件截断（偏移 0x20）", translator)).toBe(
    "Could not open this board: HFSS DEF file is truncated at offset 0x20",
  );
  expect(
    localizeError("HFSS DEF 未定义的记录类型 17（偏移 0x30）", translator),
  ).toBe(
    "Could not open this board: HFSS DEF has undefined record type 17 at offset 0x30",
  );
  expect(
    localizeError("HFSS DEF 尚未验证的值类型 9（偏移 0x40）", translator),
  ).toBe(
    "Could not open this board: HFSS DEF has unverified value type 9 at offset 0x40",
  );
});

test("layer summaries and encoding names use the selected language", () => {
  const translator = createViewerI18n("en");
  expect(
    localizeLayerSummary(
      [{ layerFunction: "conductor" }, { layerFunction: "plane" }],
      translator,
    ),
  ).toBe("1 conductor layer · 1 plane layer");
  expect(
    localizeLayerSummary(
      [{ layerFunction: "conductor" }, { layerFunction: "conductor" }],
      translator,
    ),
  ).toBe("2 conductor layers");
  expect(localizeEncodingName("gbk", translator)).toBe(
    "Simplified Chinese (GBK)",
  );
});

test("import diagnostics explain supported format limitations in the selected language", () => {
  const english = createViewerI18n("en");
  const chinese = createViewerI18n("zh-CN");
  const examples = [
    [
      "3 个设计铜区没有已保存填充，未重新铺铜",
      "3 design copper zones have no saved fill; copper was not repoured",
    ],
    [
      "PADS 2 个设计铜区没有已保存填充，暂不重新铺铜",
      "2 PADS design copper zones have no saved fill; copper was not repoured",
    ],
    [
      "4 个 Polygon6 设计轮廓没有匹配的已保存填充，未重新铺铜",
      "4 Polygon6 design outlines have no matching saved fill; copper was not repoured",
    ],
    [
      "ODB++ 保留 5 条非 UTF-8 说明属性的原始字节；几何、位号和网络已按独立记录读取。",
      "ODB++ preserved the original bytes of 5 non-UTF-8 description attributes; geometry, references, and nets were read from separate records.",
    ],
    [
      "原始文字缺少 2 种字形，暂用 ? 显示：甲 乙",
      "2 original text glyphs are unavailable and are shown as ?: 甲 乙",
    ],
    ["走线 42 的层 7 未定义", "Trace 42 refers to undefined layer 7"],
    [
      "PADS 封装名称含非 UTF-8 字节 @123",
      "PADS footprint name has non-UTF-8 bytes at offset 123",
    ],
    ["字体定义表字段无效", "The font definition table has invalid fields"],
    [
      "PADS 12:3 层 7: 同一铜层有冲突的焊盘定义",
      "PADS pin 12:3 has conflicting pad definitions on layer 7",
    ],
    ["Padstack 7 的焊盘类型无效", "Padstack 7 has an invalid pad type"],
    [
      "Padstack 7 的类型 5 焊盘尺寸无效",
      "Padstack 7 has invalid dimensions for pad type 5",
    ],
    ["Padstack 7 的圆环内外径无效", "Padstack 7 has invalid annular diameters"],
    [
      "Padstack 7 的焊盘类型 22 缺少形状引用",
      "Padstack 7 pad type 22 is missing a shape reference",
    ],
    [
      "Padstack 7 的焊盘类型 22 尚无有效几何（形状引用 123）",
      "Padstack 7 pad type 22 has no valid geometry (shape reference 123)",
    ],
  ] as const;
  for (const [source, translated] of examples) {
    expect(localizeDiagnostic(source, chinese)).toBe(source);
    expect(localizeDiagnostic(source, english)).toBe(translated);
  }
});

test("unknown diagnostic text uses a translated fallback in English", () => {
  const translator = createViewerI18n("en");
  expect(localizeDiagnostic("PADS 铜区出现未知问题", translator)).toBe(
    "PADS has an unsupported or invalid source feature",
  );
});
