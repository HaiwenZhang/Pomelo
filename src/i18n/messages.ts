import type { BrdTextEncoding } from "../lib/allegro/binary/text-decoder";
import type { LayerFunction } from "../lib/board/model";

import type { i18n } from "i18next";
import { additionalParserErrorPatterns } from "./parser-error-catalog";
import { translations } from "./resources";

const phaseKeys = new Map<string, string>(
  Object.entries(translations["zh-CN"].translation.progress).map(
    ([key, value]) => [value, `progress.${key}`],
  ),
);
const errorKeys = new Map<string, string>(
  Object.entries(translations["zh-CN"].translation.errors).map(
    ([key, value]) => [value, `errors.${key}`],
  ),
);
const parserErrorKeys = new Map<string, string>(
  Object.entries(translations["zh-CN"].translation.parserErrors).map(
    ([key, value]) => [value, `parserErrors.${key}`],
  ),
);
const hfssDefReasonKeys = new Map<string, string>(
  Object.entries(translations["zh-CN"].translation.hfssDefReasons).map(
    ([key, value]) => [value, `hfssDefReasons.${key}`],
  ),
);
const hfssDefReasonPatterns: readonly (readonly [RegExp, string])[] = [
  [/^未定义的记录类型 (\d+)$/, "undefinedRecord"],
  [/^尚未验证的值类型 (\d+)$/, "unverifiedValueType"],
  [/^未验证的格式版本 (.+)$/, "unverifiedVersion"],
];

const parserErrorPatterns: readonly (readonly [RegExp, string])[] = [
  [/^未知记录类型 (0x[\da-f]+)$/i, "brdUnknownRecord"],
  [
    /^记录 #(\d+)，类型 (0x[\da-f]+)，偏移 (0x[\da-f]+)：.*$/i,
    "brdRecordFailed",
  ],
  [/^暂不支持的 BRD 格式：(0x[\da-f]+)$/i, "brdUnsupportedFormat"],
  [/^BRD 数据越界：(0x[\da-f]+)，需要 (\d+) 字节$/i, "brdOutOfBounds"],
  [/^记录未对齐：(0x[\da-f]+)$/i, "brdUnalignedRecord"],
  [/^重复对象 ID (\d+)$/, "brdDuplicateObject"],
  [/^KiCad 多余右括号 @(\d+)$/, "kicadExtraParenthesis"],
  [/^KiCad 顶层对象缺少名称 @(\d+)$/, "kicadUnnamedObject"],
  [/^KiCad 根表达式外含额外内容 @(\d+)$/, "kicadExtraContent"],
  [/^KiCad 对象缺少原子值 @(\d+)$/, "kicadMissingAtom"],
  [/^KiCad (\S+) 参数 (\d+) 不是原子值$/, "kicadInvalidAtom"],
  [/^KiCad (\S+) 参数 (\d+) 不是有限数字$/, "kicadInvalidNumber"],
  [/^KiCad (\S+) 缺少 (\S+)$/, "kicadMissingField"],
  [/^KiCad 重复铜层 (.+)$/, "kicadDuplicateCopperLayer"],
  [/^KiCad 网络编号无效 (\d+)$/, "kicadInvalidNet"],
  [/^KiCad 网络编号没有定义 (\d+)$/, "kicadUndefinedNet"],
  [/^KiCad 走线引用未知铜层 (.+)$/, "kicadUnknownTraceLayer"],
  [/^KiCad 焊盘引用未知网络 (\d+)$/, "kicadUnknownPadNet"],
  [/^KiCad 铜区引用未知网络 (\d+)$/, "kicadUnknownZoneNet"],
  [/^KiCad 焊盘形状未支持 (.+)$/, "kicadUnsupportedPadShape"],
  [/^KiCad 焊盘类型未支持 (\S+) @(\d+)$/, "kicadUnsupportedPadType"],
  [/^KiCad 焊盘孔尺寸无效 @(\d+)$/, "kicadInvalidPadHole"],
  [/^PADS 分节 (\d+) 记录尺寸不符$/, "padsSectionRecordSize"],
  [/^PADS 分节数量无效 (\d+)$/, "padsSectionCount"],
  [/^PADS 分节 (\d+) 超出数据区$/, "padsSectionOutOfBounds"],
  [/^PADS 版本 (0x[\da-f]+) 的布局尚待核验$/i, "padsUnverifiedVersion"],
  [/^PADS 数据越界 (\d+)\+(\d+)\/(\d+)$/, "padsOutOfBounds"],
  [/^PADS 铜区层号无效 (\d+)$/, "padsInvalidCopperLayer"],
  [/^PADS (\d+) 个铜区无法转换：(.+)$/, "padsCopperConversion"],
  [/^PADS 0x2011 分页 (\d+) 布局尚待核验$/, "padsUnverifiedPage"],
  [/^PADS 走线对象节点句柄缺失 (\d+)$/, "padsMissingRouteNode"],
  [/^ODB\+\+ 缺少文件：(.+)$/, "odbMissingFile"],
  [/^ODB\+\+ 当前需要单个板级 step，归档包含 (\d+) 个$/, "odbStepCount"],
  [/^ODB\+\+ 负片层尚未支持：(.+)$/, "odbNegativeLayer"],
  [/^ODB\+\+ 不支持的单位：(.+)$/, "odbUnsupportedUnits"],
  [/^ODB\+\+ TAR 校验失败：(\d+)$/, "odbTarChecksum"],
  [/^ODB\+\+ TAR 路径无效：(.+)$/, "odbTarPath"],
  [/^ODB\+\+ TAR 文件截断或过大：(\d+)$/, "odbTarTruncated"],
  [/^ODB\+\+ TAR 重复路径：(.+)$/, "odbTarDuplicatePath"],
  [/^需要一个 ODB\+\+ matrix\/matrix，找到 (\d+) 个$/, "odbMatrixCount"],
  [/^ODB\+\+ 未定义符号 (.+)$/, "odbUndefinedSymbol"],
  [/^ODB\+\+ 未支持的图元：(.+)$/, "odbUnsupportedFeature"],
  [/^HFSS 缺失网络 (\d+)$/, "hfssMissingNet"],
  [/^HFSS 当前需要一个板级 Cell，实际 (\d+) 个$/, "hfssCellCount"],
  [/^HFSS 重复层 ID (\d+)$/, "hfssDuplicateLayer"],
  [/^HFSS 重复网络 ID (\d+)$/, "hfssDuplicateNet"],
  [/^HFSS 图元 (\d+) 引用缺失层 (\d+)$/, "hfssMissingPrimitiveLayer"],
  [/^HFSS 图元 (\d+) 引用缺失网络 (\d+)$/, "hfssMissingPrimitiveNet"],
  [/^HFSS DEF (.+)（偏移 (0x[\da-f]+)）$/i, "hfssDefError"],
  [/^Altium (\S+) Header 长度无效$/, "altiumHeaderLength"],
  [/^Altium 重复数据流 (.+)$/, "altiumDuplicateStream"],
  [/^Altium 数据流不存在：(.+)$/, "altiumMissingStream"],
  [/^Altium 扇区越界 (\d+)$/, "altiumSectorOutOfBounds"],
  [/^Altium 记录流提前结束：(\d+)\/(\d+)$/, "altiumRecordStreamTruncated"],
  [/^Altium 子记录长度截断 @(\d+)$/, "altiumSubrecordLengthTruncated"],
  [/^Altium 子记录越界 @(\d+): (\d+)$/, "altiumSubrecordOutOfBounds"],
  [/^Altium 记录流剩余 (\d+) 字节$/, "altiumTrailingBytes"],
];

type DiagnosticPattern = readonly [RegExp, string];
const diagnosticPatterns: readonly DiagnosticPattern[] = [
  [/^(\d+) 个设计铜区没有已保存填充，未重新铺铜$/, "kicadUnfilledZones"],
  [/^PADS (\d+) 个设计铜区没有已保存填充，暂不重新铺铜$/, "padsUnfilledZones"],
  [
    /^(\d+) 个 Polygon6 设计轮廓没有匹配的已保存填充，未重新铺铜$/,
    "altiumUnfilledPolygons",
  ],
  [
    /^ODB\+\+ 保留 (\d+) 条非 UTF-8 说明属性的原始字节；几何、位号和网络已按独立记录读取。$/,
    "odbOpaqueProperties",
  ],
  [/^原始文字缺少 (\d+) 种字形，暂用 \? 显示：(.*)$/, "missingGlyphs"],
  [/^(\d+) 条源圆弧退化为直线$/, "kicadDegenerateArcs"],
  [/^(\d+) 个偏心钻孔位置尚未适配，焊盘和孔径已保留$/, "kicadOffsetDrills"],
  [/^(\d+) 个填充图形目前只显示边界，填充尚未适配$/, "kicadFilledGraphics"],
  [/^(\d+) 个板级文字尚未适配$/, "kicadBoardTexts"],
  [/^KiCad 封装图形和文字尚未适配$/, "kicadFootprints"],
  [/^PADS 场景尚未接入普通图形和文字$/, "padsGraphics"],
  [/^PADS 网络端点未解析 (.*)$/, "padsUnresolvedNet"],
  [
    /^PADS 源文件没有专用板框记录，实际外形仍待从普通图形确认$/,
    "padsMissingOutline",
  ],
  [
    /^PADS (\d+) 个热连接接点缺少独立网络证据，沿用铺铜网络$/,
    "padsThermalNets",
  ],
  [/^(\d+) 个非铜层 Region6 图形只显示轮廓$/, "altiumNonCopperRegions"],
  [/^(\d+) 个裁切或其他 Region6 图形尚未显示$/, "altiumOtherRegions"],
  [/^(\d+) 个空文字或零尺寸文字没有笔画$/, "altiumEmptyTexts"],
  [/^(\d+) 个非笔画字体文字暂以通用笔画字体显示$/, "altiumFonts"],
  [/^(\d+) 个非铜层焊盘缺少有效轮廓$/, "altiumNonCopperPads"],
  [/^(\d+) 个焊盘使用未支持形状$/, "altiumPadShapes"],
  [/^(\d+) 个焊盘孔形按圆孔显示$/, "altiumPadHoles"],
  [/^(\d+) 个长孔具有非直角局部旋转，显示方向待支持$/, "altiumRotatedSlots"],
  [
    /^(\d+) 个焊盘具有偏心孔；铜形偏移已保留，孔位仍以焊盘中心显示$/,
    "altiumOffsetHoles",
  ],
  [
    /^(\d+) 个铜区填充走线\/圆弧以源笔画显示，尚未并合为填充区域$/,
    "altiumFillTracks",
  ],
  [/^(\d+) 个禁布图元尚未显示$/, "altiumKeepouts"],
  [/^(\d+) 个零宽或退化图元尚未显示$/, "altiumZeroWidth"],
  [/^(\d+) 个 Fill6 禁布图元尚未显示$/, "altiumFillKeepouts"],
  [/^(\d+) 个 Fill6 矩形尺寸退化$/, "altiumDegenerateFills"],
  [
    /^字符编码 (\S+) 无法完整解读 (\d+) 处内容（偏移 (.*)）；可在文件信息中选择编码后重新读取。原始字节保留。$/,
    "encodingIssues",
  ],
  [/^键合线 (\d+) 的端点、profile 或段变体尚未支持$/, "bondWireUnsupported"],
  [/^走线 (\d+) 的层 (\d+) 未定义$/, "traceUndefinedLayer"],
  [/^走线 (\d+) 缺失段 (\d+)$/, "traceMissingSegment"],
  [/^走线 (\d+) 的链表遇到类型 (\d+)$/, "traceUnexpectedType"],
  [/^过孔 (\d+) 缺失定义或使用未支持的 Padstack 引用 (\d+)$/, "viaPadstack"],
  [/^键合指 (\d+) 的放置或 Padstack 变体尚未支持$/, "bondFingerUnsupported"],
  [/^器件 (.*) 缺失焊盘 (\d+)$/, "componentMissingPad"],
  [/^焊盘 (\d+) 缺失定义或使用未支持的 Padstack 引用 (\d+)$/, "padPadstack"],
  [/^裸片焊盘 (\d+) 的背面放置尚未核验$/, "diePadBack"],
  [/^铜皮 (\d+) 无有效边界$/, "zoneMissingBoundary"],
  [/^存在多组字体定义，使用第一组；需要核验字体索引$/, "multipleFonts"],
  [/^字体定义表字段无效$/, "invalidFontTable"],
  [/^文字链缺失引用 (\d+)$/, "textMissingReference"],
  [/^文字链遇到非文字记录 (\d+) \/ (\d+)$/, "textUnexpectedRecord"],
  [/^文字 (\d+) 缺少内容记录$/, "textMissingContent"],
  [/^文字 (\d+) 的字体 (\d+) 无有效尺寸$/, "textInvalidFontSize"],
  [/^尺寸图形 (\d+) 缺失或无效路径引用 (\d+)$/, "drawingInvalidPath"],
  [/^尺寸图形 (\d+) 的路径 (\d+) 坐标或线宽无效$/, "drawingInvalidGeometry"],
  [/^尺寸图形所属链缺失或无效引用 (\d+)$/, "drawingInvalidChain"],
  [/^尺寸图形 (\d+) 所属对象与链表不一致$/, "drawingOwnerMismatch"],
  [/^尺寸图形 (\d+) 未关联到有效板级或已放置实例链$/, "drawingUnlinked"],
  [/^PADS 封装名称含非 UTF-8 字节 @(\d+)$/, "padsFootprintEncoding"],
  [/^PADS 名称含非 UTF-8 字节，原字节已保留 @(\d+)$/, "padsNameEncoding"],
  [/^PADS (.*) 槽孔电镀属性待核验$/, "padsSlotPlating"],
  [/^PADS (.+) 层 (\d+): 同一铜层有冲突的焊盘定义$/, "padsLayerConflict"],
  [/^PADS (.+) 层 (\d+): (.+)$/, "padsLayerProblem"],
  [/^Padstack (\d+) 的焊盘类型无效$/, "padstackInvalidType"],
  [/^Padstack (\d+) 的类型 (\d+) 焊盘尺寸无效$/, "padstackInvalidDimensions"],
  [/^Padstack (\d+) 的圆环内外径无效$/, "padstackInvalidAnnularDiameters"],
  [/^Padstack (\d+) 的焊盘类型 22 缺少形状引用$/, "padstackMissingShape"],
  [
    /^Padstack (\d+) 的焊盘类型 (\d+) 尚无有效几何（形状引用 (\d+)）$/,
    "padstackInvalidShapeGeometry",
  ],
  [/^Padstack (\d+) 的焊盘类型 (\d+) 尚无有效几何$/, "padstackInvalidGeometry"],
];

/** Keep parser and renderer messages stable; translate at the presentation seam. */
export function localizePhase(phase: string, translator: i18n): string {
  const objectCount = /^解析对象 · (.+)$/.exec(phase);
  if (objectCount)
    return translator.t("progress.objects", {
      count: objectCount[1],
      interpolation: { skipOnVariables: false },
    });
  const padsCopper = /^构建 PADS 铜区 · (\d+)\/(\d+)$/.exec(phase);
  if (padsCopper)
    return translator.t("progress.padsCopperCount", {
      completed: padsCopper[1],
      total: padsCopper[2],
    });
  const odbLayer = /^读取 ODB\+\+ 图层 · (.+)$/.exec(phase);
  if (odbLayer) return translator.t("progress.odbLayer", { name: odbLayer[1] });
  const key = phaseKeys.get(phase);
  return key
    ? translator.t(key)
    : translator.language === "zh-CN"
      ? phase
      : translator.t("progress.working");
}

export function localizeError(message: string, translator: i18n): string {
  const key = errorKeys.get(message);
  if (key) return translator.t(key);
  const deviceLost = /^图形设备中断：(.*)$/.exec(message);
  if (deviceLost)
    return translator.t("errors.deviceLost", { reason: deviceLost[1] });
  const geometryBuffer = /^几何缓冲区超出设备上限：(\d+) \/ (\d+)$/.exec(
    message,
  );
  if (geometryBuffer)
    return translator.t("errors.geometryBufferLimit", {
      size: geometryBuffer[1],
      limit: geometryBuffer[2],
    });
  if (translator.language === "zh-CN") return message;
  const parserKey = parserErrorKeys.get(message);
  if (parserKey)
    return translator.t("errors.openFailed", {
      details: translator.t(parserKey),
    });
  for (const [pattern, patternKey] of [
    ...parserErrorPatterns,
    ...additionalParserErrorPatterns,
  ]) {
    const match = pattern.exec(message);
    if (match) {
      let detail = match[1];
      if (patternKey === "hfssDefError") {
        const reasonKey = hfssDefReasonKeys.get(detail);
        const reasonPattern = hfssDefReasonPatterns
          .map(([pattern, key]) => [pattern.exec(detail), key] as const)
          .find(([match]) => match);
        detail = reasonKey
          ? translator.t(reasonKey)
          : reasonPattern
            ? translator.t(`hfssDefReasons.${reasonPattern[1]}`, {
                id: reasonPattern[0]![1],
              })
            : translator.t("hfssDefReasons.invalidData");
      }
      const details = translator.t(`parserErrors.${patternKey}`, {
        detail,
        value: match[2],
        extra: match[3],
      });
      return translator.t("errors.openFailed", { details });
    }
  }
  const diagnostic = translateDiagnostic(message, translator);
  if (diagnostic)
    return translator.t("errors.openFailed", { details: diagnostic });
  const offset = /0x[\da-f]+/i.exec(message)?.[0];
  const format = /^(?:BRD|KiCad|PADS|ODB\+\+|HFSS|Altium)(?=\s|$)/.exec(
    message,
  )?.[0];
  const details = /[\p{Script=Han}]/u.test(message)
    ? translator.t(
        format
          ? offset
            ? "parserErrors.unknownFormatAtOffset"
            : "parserErrors.unknownFormat"
          : offset
            ? "parserErrors.unknownAtOffset"
            : "parserErrors.unknown",
        { format, offset },
      )
    : message;
  return translator.t("errors.openFailed", { details });
}

/** Diagnostic strings remain unchanged in the scene; only the visible copy is translated. */
export function localizeDiagnostic(message: string, translator: i18n): string {
  if (translator.language === "zh-CN") return message;
  const translated = translateDiagnostic(message, translator);
  if (translated) return translated;
  if (!/[\p{Script=Han}]/u.test(message)) return message;
  const format =
    /^(?:BRD|KiCad|PADS|ODB\+\+|HFSS|Altium|Padstack)(?=\s|$)/.exec(
      message,
    )?.[0];
  return format
    ? translator.t("diagnostics.unknownFormat", { format })
    : translator.t("diagnostics.unknown");
}

function translateDiagnostic(
  message: string,
  translator: i18n,
): string | undefined {
  for (const [pattern, key] of diagnosticPatterns) {
    const match = pattern.exec(message);
    if (match)
      return translator.t(`diagnostics.${key}`, {
        count: /^\d+$/.test(match[1] ?? "") ? Number(match[1]) : undefined,
        detail: match[1],
        value: match[2],
        extra: match[3],
      });
  }
  return undefined;
}

export function localizeLayerSummary(
  layers: readonly { layerFunction?: LayerFunction }[],
  translator: i18n,
): string {
  const counts: Record<LayerFunction, number> = {
    conductor: 0,
    plane: 0,
    dielectric: 0,
    unknown: 0,
  };
  for (const layer of layers) counts[layer.layerFunction ?? "unknown"]++;
  return (Object.keys(counts) as LayerFunction[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) =>
      translator.t("metadata.layer", {
        count: counts[kind],
        kind: translator.t(`metadata.functions.${kind}`),
      }),
    )
    .join(" · ");
}

export function localizeEncodingName(
  encoding: BrdTextEncoding,
  translator: i18n,
): string {
  return translator.t(`metadata.encodings.${encoding}`);
}
