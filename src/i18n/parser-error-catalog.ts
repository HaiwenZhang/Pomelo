/** Exact parser failures that do not carry interpolation values. */
const messages = {
  altiumLegacyLayerChain: [
    "Altium 旧版层链循环或层号无效",
    "Altium legacy layer chain loops or has an invalid layer number",
  ],
  altiumTooFewCopperLayers: [
    "Altium 铜层堆栈不足",
    "Altium copper stack has too few layers",
  ],
  altiumInvalidStackOrder: [
    "Altium 顶层/底层堆栈顺序无效",
    "Altium top and bottom layer stack order is invalid",
  ],
  altiumTooFewOutlineVertices: [
    "Altium 物理板框顶点不足",
    "Altium physical outline has too few vertices",
  ],
  altiumTruncatedWideStringsHeader: [
    "Altium WideStrings6 表头截断",
    "Altium WideStrings6 header is truncated",
  ],
  altiumTruncatedPropertyLength: [
    "Altium 属性流长度字段截断",
    "Altium property stream length field is truncated",
  ],
  copperMeshTooLarge: [
    "铜皮轮廓三角化输出超出上限",
    "Copper contour triangulation exceeds the limit",
  ],
  rendererClosed: ["渲染器已关闭", "Renderer is closed"],
  invalidStrokeFontGlyph: [
    "扩展笔画字体字形无效",
    "Invalid extended stroke font glyph",
  ],
  padstackTooManyLayers: [
    "Padstack 层数超过 256",
    "Padstack has more than 256 layers",
  ],
  odbExpandedTooLarge: [
    "ODB++ 解包超过 512 MiB 限额",
    "ODB++ expanded data exceeds 512 MiB",
  ],
  odbHoleWithoutIsland: [
    "ODB++ 孔洞没有所属岛",
    "ODB++ hole has no owning island",
  ],
  odbContourEdgeWithoutStart: [
    "ODB++ 轮廓边缺少 OB",
    "ODB++ contour edge is missing OB",
  ],
  odbInvalidContourDirection: [
    "ODB++ OC 方向无效",
    "Invalid ODB++ OC direction",
  ],
  odbContourEndWithoutStart: ["ODB++ OE 缺少 OB", "ODB++ OE is missing OB"],
  odbIncompleteSurface: ["ODB++ SE 不完整", "Incomplete ODB++ SE surface"],
  odbInvalidArcDirection: ["ODB++ 圆弧方向无效", "Invalid ODB++ arc direction"],
  odbResizePadUnsupported: [
    "ODB++ 暂不支持 resize 焊盘",
    "ODB++ resized pads are unsupported",
  ],
  odbProfileNotSurface: [
    "ODB++ profile 不是面域",
    "ODB++ profile is not a surface",
  ],
  hfssInvalidPolygonDataType: [
    "HFSS PolygonData 类型无效",
    "Invalid HFSS PolygonData type",
  ],
  hfssInvalidPolygonCoordinateCount: [
    "HFSS PolygonData 坐标数量无效",
    "HFSS PolygonData has an invalid coordinate count",
  ],
  hfssInvalidPolygonCoordinate: [
    "HFSS PolygonData 坐标无效",
    "HFSS PolygonData has invalid coordinates",
  ],
  hfssArcAtContourStart: [
    "HFSS 轮廓起点不能是圆弧标记",
    "HFSS contour cannot start with an arc marker",
  ],
  hfssCoincidentArcEndpoints: [
    "HFSS 圆弧端点重合，无法确定弓高方向",
    "HFSS arc endpoints coincide; sagitta direction cannot be determined",
  ],
  hfssConsecutiveArcMarkers: [
    "HFSS 连续圆弧标记缺少端点",
    "Consecutive HFSS arc markers have no endpoint",
  ],
  hfssOpenArcWithoutEndpoint: [
    "HFSS 开放路径末端圆弧缺少端点",
    "HFSS open path ends with an arc missing its endpoint",
  ],
  hfssInvalidCircleRadius: ["HFSS 圆半径无效", "Invalid HFSS circle radius"],
  hfssInvalidRectangleDimensions: [
    "HFSS 矩形尺寸无效",
    "Invalid HFSS rectangle dimensions",
  ],
  hfssInvalidOutlineWidth: ["HFSS 板框线宽无效", "Invalid HFSS outline width"],
  hfssNonroundTraceUnsupported: [
    "HFSS 非圆端走线尚待适配",
    "HFSS traces with nonround ends are unsupported",
  ],
  hfssVoidedTraceUnsupported: [
    "HFSS 带孔走线尚待适配",
    "HFSS traces with voids are unsupported",
  ],
  hfssInvalidTraceWidth: ["HFSS 走线宽度无效", "Invalid HFSS trace width"],
  hfssDrillEndsNotConductors: [
    "HFSS 钻孔起止层不是导体",
    "HFSS drill start or end layer is not a conductor",
  ],
  hfssDefTooLarge: [
    "HFSS DEF 超过 512 MiB 限额",
    "HFSS DEF exceeds the 512 MiB limit",
  ],
  hfssInvalidPadstackReference: [
    "HFSS Padstack 整数引用无效",
    "Invalid HFSS padstack integer reference",
  ],
  hfssInvalidPadstackName: [
    "HFSS Padstack 名称无效",
    "Invalid HFSS padstack name",
  ],
  hfssInvalidPadstackInstance: [
    "HFSS Padstack 实例类型无效",
    "Invalid HFSS padstack instance type",
  ],
  hfssDrillOverrideUnsupported: [
    "HFSS 尚未支持实例孔径覆盖",
    "HFSS padstack instance drill overrides are unsupported",
  ],
  hfssPadstackExtensionsUnsupported: [
    "HFSS 尚未支持非空 Padstack 实例扩展字段",
    "Nonempty HFSS padstack instance extension fields are unsupported",
  ],
  hfssInvalidLayoutPinFlag: [
    "HFSS Layout Pin 标志无效",
    "Invalid HFSS Layout Pin flag",
  ],
  hfssMissingPadstackBinding: [
    "HFSS Padstack 实例引用缺失绑定",
    "HFSS padstack instance refers to a missing binding",
  ],
  hfssMissingPadDimensions: [
    "HFSS 焊盘缺少尺寸",
    "HFSS pad is missing dimensions",
  ],
  hfssOvalCornerTooLarge: [
    "HFSS Oval 圆角半径超过尺寸",
    "HFSS oval corner radius exceeds its dimensions",
  ],
  hfssPolygonMissingPly: ["HFSS 多边形缺少 ply", "HFSS polygon is missing ply"],
  hfssPolygonMissingPt: ["HFSS 多边形缺少 pt", "HFSS polygon is missing pt"],
  hfssInvalidTextPolygonCoordinateCount: [
    "HFSS 文本多边形坐标数量无效",
    "HFSS text polygon has an invalid coordinate count",
  ],
  hfssInvalidTextPolygonOrder: [
    "HFSS 文本多边形坐标顺序无效",
    "HFSS text polygon has an invalid coordinate order",
  ],
  hfssTextPolygonNotClosed: [
    "HFSS 文本多边形缺少闭合标志",
    "HFSS text polygon is missing a closed flag",
  ],
  hfssPadPolygonNotClosed: [
    "HFSS 焊盘多边形必须闭合",
    "HFSS pad polygon must be closed",
  ],
  hfssUnverifiedPolygonSlot: [
    "HFSS 多边形钻孔不是已验证的直槽孔",
    "HFSS polygon drill is not a verified straight slot",
  ],
  hfssInvalidPolygonSlotGeometry: [
    "HFSS 多边形钻孔不满足直槽孔圆弧与切线约束",
    "HFSS polygon drill does not satisfy straight-slot arc and tangent constraints",
  ],
  hfssUnnamedBoardCell: [
    "HFSS 板级 Cell 缺少名称",
    "HFSS board Cell is missing a name",
  ],
  hfssInvalidLayerDefinition: [
    "HFSS 层定义无效",
    "Invalid HFSS layer definition",
  ],
  hfssInvalidObjectTypeWithoutSchema: [
    "HFSS 对象类型无效",
    "Invalid HFSS object type",
  ],
  kicadCoincidentArcPoints: [
    "KiCad 圆弧起点、中点和终点重合",
    "KiCad arc start, midpoint, and endpoint coincide",
  ],
  kicadDegenerateArcMidpoint: [
    "KiCad 退化圆弧的中点不在端点之间",
    "KiCad degenerate arc midpoint is not between its endpoints",
  ],
  kicadInvalidArcDeterminant: [
    "KiCad 圆弧行列式无效",
    "Invalid KiCad arc determinant",
  ],
  kicadInvalidArcGeometry: [
    "KiCad 圆弧半径或扫角无效",
    "Invalid KiCad arc radius or sweep",
  ],
  kicadInvalidOutlineWidth: [
    "KiCad 板框线宽无效",
    "Invalid KiCad outline width",
  ],
  kicadInvalidTopLevelRange: [
    "KiCad 顶层对象范围无效",
    "Invalid KiCad top-level object range",
  ],
  padsMissingCopperOwner: [
    "PADS 铜区 owner 不存在",
    "PADS copper area owner is missing",
  ],
  padsMismatchedCopperPieceOwner: [
    "PADS 铜区分段归属不符",
    "PADS copper area piece has a mismatched owner",
  ],
  padsMultipleOuterContours: [
    "PADS 多外轮廓填充尚待核验",
    "PADS fill with multiple outer contours needs verification",
  ],
  padsMissingCopperNet: [
    "PADS 铜区缺少网络映射",
    "PADS copper area is missing a net mapping",
  ],
  padsCopperHoleLayerMismatch: [
    "PADS 铜区孔洞层不匹配",
    "PADS copper area hole is on a mismatched layer",
  ],
  padsOpenCopperContour: [
    "PADS 铜区轮廓为开放线段",
    "PADS copper area contour is an open path",
  ],
  padsThermalLayerMismatch: [
    "PADS 热连接层不匹配",
    "PADS thermal relief is on a mismatched layer",
  ],
  padsThermalPieceUnsupported: [
    "PADS 热连接非线段分段尚待核验",
    "PADS thermal relief has an unsupported non-line segment",
  ],
  padsCopperSourceGap: [
    "PADS 铜区源序号不连续",
    "PADS copper area source numbers are not contiguous",
  ],
  padsCopperNetConflict: [
    "PADS 铜区接点网络证据冲突",
    "PADS copper area junctions have conflicting net evidence",
  ],
  padsInvalidCopperOffset: [
    "PADS 铜区轮廓宽度或精度无效",
    "Invalid PADS copper contour width or precision",
  ],
  padsEmptyCopperContour: [
    "PADS 铜区轮廓为空",
    "PADS copper area contour is empty",
  ],
  padsUnclosedCopperContour: [
    "PADS 铜区轮廓未闭合",
    "PADS copper area contour is not closed",
  ],
  padsInvalidCopperVertex: [
    "PADS 铜区轮廓顶点无效",
    "Invalid PADS copper contour vertex",
  ],
  padsInvalidCopperStrokeWidth: [
    "PADS 铜区描边宽度无效",
    "Invalid PADS copper stroke width",
  ],
  padsNoncircularContourOffset: [
    "PADS 非圆形轮廓需要独立偏移",
    "PADS noncircular contour requires a separate offset",
  ],
  padsUnresolvedThermalGeometry: [
    "PADS 热连接存在未解析几何",
    "PADS thermal relief has unresolved geometry",
  ],
  padsInvalidThermalSegment: [
    "PADS 热连接线段尺寸无效",
    "Invalid PADS thermal relief segment dimensions",
  ],
  padsInvalidOuterBoolean: [
    "PADS 铜区外轮廓布尔运算无效",
    "PADS copper outer contour Boolean operation failed",
  ],
  padsInvalidHoleBoolean: [
    "PADS 铜区孔洞布尔运算无效",
    "PADS copper hole Boolean operation failed",
  ],
  padsInvalidCircularCopperEndpoints: [
    "PADS 圆形铜区端点无效",
    "Invalid PADS circular copper area endpoints",
  ],
  padsInvalidCircularCopperRadius: [
    "PADS 圆形铜区半径无效",
    "Invalid PADS circular copper area radius",
  ],
  padsUnpairedCopperCoordinates: [
    "PADS 铜区线段坐标配对无效",
    "PADS copper segment coordinates are not paired",
  ],
  padsInvalidCopperArc: [
    "PADS 铜区圆弧参数无效",
    "Invalid PADS copper arc parameters",
  ],
  padsZeroSweepMismatch: [
    "PADS 零扫角与端点不符",
    "PADS zero sweep does not match the arc endpoints",
  ],
  padsInvalidRouteLayerCoordinates: [
    "PADS 走线层/坐标记录尺寸无效",
    "Invalid PADS route layer or coordinate record size",
  ],
  padsEmptyRouteMismatch: [
    "PADS 空走线对象与坐标不符",
    "PADS empty route object does not match its coordinates",
  ],
  padsInvalidRouteLayerOrder: [
    "PADS 走线层排列无效",
    "Invalid PADS route layer order",
  ],
  padsInvalidRouteNodePages: [
    "PADS 走线节点页组无效",
    "Invalid PADS route node page group",
  ],
  padsInvalidRouteNodePageIndex: [
    "PADS 走线节点页序号无效",
    "Invalid PADS route node page index",
  ],
  padsInvalidRouteNodePageCount: [
    "PADS 走线节点页数量无效",
    "Invalid PADS route node page count",
  ],
  padsNodeHandleOverflow: ["PADS 节点句柄溢出", "PADS node handle overflow"],
  padsInvalidRouteNodeCoverage: [
    "PADS 走线节点页覆盖无效",
    "Invalid PADS route node page coverage",
  ],
  padsRouteLayerObjectCountMismatch: [
    "PADS 走线层对象计数不符",
    "PADS route layer object count does not match",
  ],
  padsLayerNodeOutOfBounds: [
    "PADS 层节点引用越界",
    "PADS layer node reference is out of bounds",
  ],
  padsNodeLayerConflict: [
    "PADS 节点层冲突",
    "PADS node has conflicting layers",
  ],
  padsMissingNodeHandle: [
    "PADS 走线节点句柄缺失",
    "PADS route node handle is missing",
  ],
  padsIncompleteRouteNodes: [
    "PADS 走线对象节点关联不完整",
    "PADS route object has incomplete node associations",
  ],
  padsRouteCoordinatesOutOfBounds: [
    "PADS 走线坐标分配越界",
    "PADS route coordinate assignment is out of bounds",
  ],
  padsInvalidRouteLayerDirection: [
    "PADS 走线层方向无效",
    "Invalid PADS route layer direction",
  ],
  padsUnconsumedRouteCoordinates: [
    "PADS 走线坐标未完整消费",
    "PADS route coordinates were not fully consumed",
  ],
  padsGraphicRingOutOfBounds: [
    "PADS 图形环形记录越界",
    "PADS graphic ring record is out of bounds",
  ],
  padsInvalidGraphicRecord: [
    "PADS 图形记录尺寸无效",
    "Invalid PADS graphic record size",
  ],
  padsInvalidOutlinePieceReference: [
    "PADS 板框分段引用无效",
    "Invalid PADS outline piece reference",
  ],
  padsInvalidOutlineArcReference: [
    "PADS 板框圆弧引用无效",
    "Invalid PADS outline arc reference",
  ],
  padsTruncatedJunctionLinks: [
    "PADS 接点关系截断",
    "PADS junction links are truncated",
  ],
  padsInvalidJunctionNetCount: [
    "PADS 接点关系网络数量无效",
    "Invalid PADS junction link net count",
  ],
  padsJunctionLinkCountOutOfBounds: [
    "PADS 接点关系数量越界",
    "PADS junction link count is out of bounds",
  ],
  padsInvalidJunctionReference: [
    "PADS 接点关系引用无效",
    "Invalid PADS junction link reference",
  ],
  padsJunctionMemberOutOfBounds: [
    "PADS 接点关系成员越界",
    "PADS junction link member is out of bounds",
  ],
  padsJunctionNetConflict: [
    "PADS 接点网络关系冲突",
    "PADS junction has conflicting net associations",
  ],
  padsInvalidJunctionRecord: [
    "PADS 接点记录尺寸无效",
    "Invalid PADS junction record size",
  ],
  padsInvalidTerminalTable: [
    "PADS 引脚表尺寸无效",
    "Invalid PADS terminal table size",
  ],
  padsInvalidPartTypeRecord: [
    "PADS 器件类型记录尺寸无效",
    "Invalid PADS part type record size",
  ],
  padsInvalidPinJunctionRange: [
    "PADS 引脚接点记录范围无效",
    "Invalid PADS pin junction record range",
  ],
  padsUnverifiedSlotCarrier: [
    "PADS 0x2011 槽孔载体尚待核验",
    "PADS 0x2011 slot carrier needs verification",
  ],
  padsInvalidBoardParameters: [
    "PADS 板参数布局校验失败",
    "PADS board parameter layout validation failed",
  ],
  padsInvalidNetRecord: [
    "PADS 网络记录尺寸无效",
    "Invalid PADS net record size",
  ],
  padsInvalidConnectionRecord: [
    "PADS 连接记录尺寸无效",
    "Invalid PADS connection record size",
  ],
  padsPourFieldOutOfBounds: [
    "PADS 铺铜字段越界",
    "PADS pour field is out of bounds",
  ],
  padsPourPieceOutOfBounds: [
    "PADS 铺铜分段引用越界",
    "PADS pour piece reference is out of bounds",
  ],
  padsPourVertexOutOfBounds: [
    "PADS 铺铜顶点引用越界",
    "PADS pour vertex reference is out of bounds",
  ],
  padsPourArcOutOfBounds: [
    "PADS 铺铜圆弧引用越界",
    "PADS pour arc reference is out of bounds",
  ],
  padsInvalidPourArcVertex: [
    "PADS 铺铜圆弧顶点引用无效",
    "Invalid PADS pour arc vertex reference",
  ],
  padsViaTooFewLayers: [
    "PADS Via 缺少至少两个铜层",
    "PADS via requires at least two copper layers",
  ],
  padsInactivePadstack: [
    "PADS 未活动焊盘定义",
    "PADS padstack definition is inactive",
  ],
  padsInvalidPadDimensions: [
    "PADS 焊盘尺寸无效",
    "Invalid PADS pad dimensions",
  ],
  padsInvalidAnnulusInnerDiameter: [
    "PADS 圆环焊盘内径无效",
    "Invalid PADS annular pad inner diameter",
  ],
  padsInvalidPadOffset: ["PADS 焊盘偏移无效", "Invalid PADS pad offset"],
  padsIncompletePinCoverage: [
    "PADS 场景引脚覆盖不完整",
    "PADS scene does not cover all source pins",
  ],
  padsDuplicateRouteObject: [
    "PADS 重复走线对象",
    "Duplicate PADS route object",
  ],
  padsNonfiniteRouteCoordinates: [
    "PADS 非有限走线坐标",
    "PADS route coordinates are not finite",
  ],
} as const;

const dynamicMessages = {
  padsDuplicatePin: [
    "PADS 重复引脚 {{detail}}",
    "Duplicate PADS pin {{detail}}",
  ],
  odbInvalidComponentRecord: [
    "ODB++ 器件记录无效：{{detail}}",
    "Invalid ODB++ component record at {{detail}}",
  ],
  hfssInvalidPadstackDefinition: [
    "HFSS Padstack 定义无效 {{detail}}",
    "Invalid HFSS padstack definition {{detail}}",
  ],
  kicadTooFewCopperFillPoints: [
    "KiCad 铜区填充点数不足 @{{detail}}",
    "KiCad copper fill has too few points at byte {{detail}}",
  ],
  altiumIncompleteOutlineVertex: [
    "Altium 板框顶点 {{detail}} 坐标不完整",
    "Altium outline vertex {{detail}} has incomplete coordinates",
  ],
  brdNetChainLoop: [
    "网络连接链循环：{{detail}}",
    "BRD net connection chain loops at {{detail}}",
  ],
  brdNetConnectionMissing: [
    "网络连接缺失：{{detail}}",
    "BRD net connection {{detail}} is missing",
  ],
  brdTraceChainLoop: [
    "走线 {{detail}} 的链表循环",
    "BRD trace {{detail}} has a loop in its chain",
  ],
  brdPadChainLoop: [
    "器件焊盘链循环 {{detail}}",
    "BRD component pad chain loops at {{detail}}",
  ],
  brdInvalidDrillField: [
    "Padstack {{detail}} 的钻孔字段无效",
    "Padstack {{detail}} has an invalid drill field",
  ],
  brdPathChainLoop: [
    "路径链循环 {{detail}}",
    "BRD path chain loops at {{detail}}",
  ],
  brdHoleChainLoop: [
    "铜皮孔洞链循环 {{detail}}",
    "BRD copper hole chain loops at {{detail}}",
  ],
  brdTextChainLoop: [
    "文字链表循环 {{detail}}",
    "BRD text chain loops at {{detail}}",
  ],
  brdInvalidTextRecord: [
    "Allegro 文字记录字段无效 {{detail}}",
    "Invalid Allegro text record field {{detail}}",
  ],
  brdUnsupportedDefinitionTable: [
    "不支持的定义表 {{detail}}",
    "Unsupported BRD definition table {{detail}}",
  ],
  brdUnsupportedFieldSubtype: [
    "不支持的字段子类型 {{detail}}",
    "Unsupported BRD field subtype {{detail}}",
  ],
  brdUnverifiedMetadataRecord: [
    "尚未验证 V{{detail}} 的 0x1a 记录布局",
    "BRD V{{detail}} record 0x1a layout is unverified",
  ],
  kicadUnsupportedPadShape: [
    "KiCad 焊盘形状未支持 {{detail}}",
    "Unsupported KiCad pad shape {{detail}}",
  ],
  kicadUnknownPadLayer: [
    "KiCad 焊盘引用未知铜层 {{detail}}",
    "KiCad pad refers to unknown copper layer {{detail}}",
  ],
  kicadUnsupportedPadstackLayer: [
    "KiCad 焊盘 Padstack 层未支持 {{detail}}",
    "Unsupported KiCad padstack layer {{detail}}",
  ],
  kicadUnsupportedCustomPadPrimitive: [
    "KiCad 自定义焊盘图元未支持 {{detail}}",
    "Unsupported KiCad custom pad primitive {{detail}}",
  ],
  kicadInvalidTraceWidth: [
    "KiCad {{detail}} 宽度无效 @{{value}}",
    "KiCad {{detail}} has invalid width at byte {{value}}",
  ],
  kicadUnsupportedViaPadstack: [
    "KiCad Via 分层 Padstack 尚未适配 @{{detail}}",
    "Layered KiCad via padstack is unsupported at byte {{detail}}",
  ],
  kicadInvalidViaSize: [
    "KiCad Via 孔径或铜径无效 @{{detail}}",
    "Invalid KiCad via drill or copper diameter at byte {{detail}}",
  ],
  kicadInvalidViaSpan: [
    "KiCad Via 层跨度无效 @{{detail}}",
    "Invalid KiCad via layer span at byte {{detail}}",
  ],
  kicadUnknownZoneFillLayer: [
    "KiCad 铜区填充引用未知层 {{detail}} @{{value}}",
    "KiCad copper fill refers to unknown layer {{detail}} at byte {{value}}",
  ],
  kicadInvalidGraphicPolygonVertex: [
    "KiCad 图形多边形顶点无效 @{{detail}}",
    "Invalid KiCad graphic polygon vertex at byte {{detail}}",
  ],
  kicadUnsupportedGraphicPolygonNode: [
    "KiCad 图形多边形节点未支持 {{detail}} @{{value}}",
    "Unsupported KiCad graphic polygon node {{detail}} at byte {{value}}",
  ],
  kicadTooFewGraphicPolygonPoints: [
    "KiCad 图形多边形点数不足 @{{detail}}",
    "KiCad graphic polygon has too few points at byte {{detail}}",
  ],
  kicadInvalidOutlineCircleRadius: [
    "KiCad 板框圆半径无效 @{{detail}}",
    "Invalid KiCad outline circle radius at byte {{detail}}",
  ],
  odbInvalidFeatureNumber: [
    "ODB++ {{detail}} 数值无效：{{value}}",
    "Invalid ODB++ {{detail}} number: {{value}}",
  ],
  odbFeatureNumberOutOfRange: [
    "ODB++ {{detail}} 超出数值范围",
    "ODB++ {{detail}} number is out of range",
  ],
  odbInvalidPadDirection: [
    "ODB++ 焊盘方向无效：{{detail}}",
    "Invalid ODB++ pad direction: {{detail}}",
  ],
  odbNegativeFeatureUnsupported: [
    "ODB++ 暂不支持负极性图元 {{detail}}",
    "Unsupported ODB++ negative-polarity feature {{detail}}",
  ],
  odbInvalidAttributeDictionary: [
    "ODB++ 属性字典无效：{{detail}}",
    "Invalid ODB++ attribute dictionary: {{detail}}",
  ],
  odbInvalidHoleShape: [
    "ODB++ 不支持的孔形：{{detail}}",
    "Unsupported ODB++ hole shape: {{detail}}",
  ],
  odbDrillSpanMissing: [
    "ODB++ 钻孔跨度缺失：{{detail}}",
    "ODB++ drill span is missing: {{detail}}",
  ],
  odbUnsupportedDrillSurface: [
    "ODB++ 钻孔面域尚未支持：{{detail}}",
    "Unsupported ODB++ drill surface: {{detail}}",
  ],
  odbUnsupportedArcSlot: [
    "ODB++ 弧形槽孔尚未支持：{{detail}}",
    "Unsupported ODB++ arc slot: {{detail}}",
  ],
  odbNonroundBrush: [
    "ODB++ 非圆线刷：{{detail}}",
    "ODB++ line brush is not round: {{detail}}",
  ],
  odbInvalidAnnulus: [
    "ODB++ 无效圆环 {{detail}}",
    "Invalid ODB++ annulus {{detail}}",
  ],
  odbInvalidThermalPad: [
    "ODB++ 无效热焊盘 {{detail}}",
    "Invalid ODB++ thermal pad {{detail}}",
  ],
  odbIntersectingThermalGaps: [
    "ODB++ 热焊盘间隙相交 {{detail}}",
    "ODB++ thermal pad gaps intersect at {{detail}}",
  ],
  odbCircularSymbolReference: [
    "ODB++ 循环符号引用：{{detail}}",
    "Circular ODB++ symbol reference: {{detail}}",
  ],
  odbMissingPinReference: [
    "ODB++ 引脚引用缺失：{{detail}}",
    "ODB++ pin reference is missing: {{detail}}",
  ],
  odbUndefinedFeatureLayer: [
    "ODB++ FID 层未定义：{{detail}}",
    "ODB++ FID layer is undefined: {{detail}}",
  ],
  odbConflictingFeatureNet: [
    "ODB++ 图元有冲突网络引用：{{detail}}",
    "ODB++ feature has conflicting net references: {{detail}}",
  ],
  odbInvalidGeometryEncoding: [
    "ODB++ 几何/引用记录编码无效：{{detail}}",
    "Invalid ODB++ geometry or reference record encoding at {{detail}}",
  ],
  odbInvalidTarEntryType: [
    "ODB++ TAR 不支持的条目类型 {{detail}}：{{value}}",
    "Unsupported ODB++ TAR entry type {{detail}}: {{value}}",
  ],
  odbUnresolvedNetFeatures: [
    "ODB++ {{detail}} 有 {{value}} 条未解析的网络图元引用",
    "ODB++ {{detail}} has {{value}} unresolved net feature references",
  ],
  hfssDuplicatePrimitive: [
    "HFSS 重复图元 ID {{detail}}",
    "Duplicate HFSS primitive ID {{detail}}",
  ],
  hfssUnsupportedPrimitive: [
    "HFSS 未支持图元类型 {{detail}}",
    "Unsupported HFSS primitive type {{detail}}",
  ],
  hfssMissingParentPrimitive: [
    "HFSS 孔洞引用缺失父图元 {{detail}}",
    "HFSS void refers to missing parent primitive {{detail}}",
  ],
  hfssNestedVoidUnverified: [
    "HFSS 嵌套孔洞尚未验证：{{detail}}",
    "Nested HFSS void is unverified: {{detail}}",
  ],
  hfssVoidLayerMismatch: [
    "HFSS 孔洞与父图元 {{detail}} 不在同一层",
    "HFSS void and parent primitive {{detail}} are on different layers",
  ],
  hfssDuplicateProperty: [
    "HFSS 重复属性 {{detail}}",
    "Duplicate HFSS property {{detail}}",
  ],
  hfssUnknownPropertyLine: [
    "HFSS 未识别属性行 {{detail}}",
    "Unrecognized HFSS property line {{detail}}",
  ],
  hfssInvalidBlockName: [
    "HFSS 块名称无效，第 {{detail}} 行",
    "Invalid HFSS block name at line {{detail}}",
  ],
  hfssMismatchedPropertyBlock: [
    "HFSS 属性块闭合不匹配，第 {{detail}} 行",
    "HFSS property block closing does not match at line {{detail}}",
  ],
  hfssInvalidPhysicalUnit: [
    "HFSS {{detail}} 单位无效：{{value}}",
    "Invalid HFSS {{detail}} unit: {{value}}",
  ],
  hfssUnknownPadstackUsage: [
    "HFSS 未识别 Padstack 使用表 {{detail}}",
    "Unrecognized HFSS padstack usage table {{detail}}",
  ],
  hfssUnknownPadstackDefinition: [
    "HFSS 未识别 Padstack 定义 {{detail}}",
    "Unrecognized HFSS padstack definition {{detail}}",
  ],
  hfssUnknownPadstackLayer: [
    "HFSS 未识别 Padstack 层 {{detail}}",
    "Unrecognized HFSS padstack layer {{detail}}",
  ],
  hfssDuplicatePadstackLayer: [
    "HFSS 重复 Padstack 层 {{detail}}",
    "Duplicate HFSS padstack layer {{detail}}",
  ],
  hfssInvalidPadstackBinding: [
    "HFSS Padstack 绑定无效 {{detail}}",
    "Invalid HFSS padstack binding {{detail}}",
  ],
  hfssMissingPadstackSpan: [
    "HFSS Padstack 起止层缺失 {{detail}}",
    "HFSS padstack start or end layer is missing for {{detail}}",
  ],
  hfssMissingPadstackLayerMapping: [
    "HFSS Padstack 缺少层映射 {{detail}}",
    "HFSS padstack is missing layer mapping {{detail}}",
  ],
  hfssMissingPadstackDefinitionLayer: [
    "HFSS Padstack 映射引用缺失定义层 {{detail}}",
    "HFSS padstack mapping refers to missing definition layer {{detail}}",
  ],
  hfssMissingPadstackUsageLayer: [
    "HFSS Padstack 使用层缺失 {{detail}}",
    "HFSS padstack usage layer {{detail}} is missing",
  ],
  padsMissingPinSource: [
    "PADS 引脚源引用缺失 {{detail}}",
    "PADS pin source reference is missing: {{detail}}",
  ],
  padsPinPlacementMismatch: [
    "PADS 引脚放置不一致 {{detail}}",
    "PADS pin placement does not match: {{detail}}",
  ],
  padsInvalidSlotGeometry: [
    "PADS 槽孔尺寸/角度无效 {{detail}}",
    "Invalid PADS slot size or angle at {{detail}}",
  ],
  padsIncompleteViaHole: [
    "PADS Via 孔定义不完整 {{detail}}",
    "PADS via hole definition is incomplete at {{detail}}",
  ],
  padsInvalidViaSlotLength: [
    "PADS Via 槽长无效 {{detail}}",
    "Invalid PADS via slot length at {{detail}}",
  ],
  padsViaMissingCopper: [
    "PADS 无孔接点缺少铜形 {{detail}}",
    "PADS undrilled junction lacks copper geometry at {{detail}}",
  ],
  padsInvalidRouteScene: [
    "PADS 走线场景属性无效 {{detail}}",
    "Invalid PADS route scene attributes at {{detail}}",
  ],
  padsInvalidOutlineOwner: [
    "PADS 板框归属或宽度无效 {{detail}}",
    "Invalid PADS outline owner or width at {{detail}}",
  ],
  padsMissingOutlineSegment: [
    "PADS 板框缺少线段 {{detail}}",
    "PADS outline is missing segment {{detail}}",
  ],
  padsInvalidOutlineCoordinates: [
    "PADS 板框坐标无效 {{detail}}",
    "Invalid PADS outline coordinates at {{detail}}",
  ],
  padsInvalidOutlineArcBounds: [
    "PADS 板框圆弧包围盒无效 {{detail}}",
    "Invalid PADS outline arc bounds at {{detail}}",
  ],
  padsOutlineArcRadiusMismatch: [
    "PADS 板框圆弧半径不一致 {{detail}}",
    "PADS outline arc radius does not match at {{detail}}",
  ],
  padsFullCircleUnsupported: [
    "PADS 板框整圆圆弧尚未解析 {{detail}}",
    "PADS full-circle outline arc is unsupported at {{detail}}",
  ],
  padsInvalidPourRecordSize: [
    "PADS 铺铜记录尺寸无效 {{detail}}",
    "Invalid PADS pour record size in section {{detail}}",
  ],
  padsInvalidPadShape: [
    "PADS 焊盘形状 {{detail}} 尚待核验",
    "PADS pad shape {{detail}} needs verification",
  ],
  padsInvalidConnectionField: [
    "PADS 连接字段越界 {{detail}}",
    "PADS connection field is out of bounds at {{detail}}",
  ],
  padsInvalidConnectionMarker: [
    "PADS 连接标记无效 {{detail}}",
    "Invalid PADS connection marker {{detail}}",
  ],
  padsInvalidLegacyConnectionMarker: [
    "PADS 旧版连接标记无效 {{detail}}",
    "Invalid legacy PADS connection marker {{detail}}",
  ],
  padsInvalidCompactConnectionMarker: [
    "PADS 紧凑连接标记无效 {{detail}}",
    "Invalid compact PADS connection marker {{detail}}",
  ],
  padsNetOwnershipConflict: [
    "PADS 网络归属冲突 {{detail}}",
    "PADS net ownership conflict: {{detail}}",
  ],
  padsInvalidLegacyNetAnchor: [
    "PADS 旧版网络连接锚点无效 {{detail}}",
    "Invalid legacy PADS net connection anchor {{detail}}",
  ],
  padsInvalidLayerRecordSize: [
    "PADS 层记录尺寸无效 {{detail}}",
    "Invalid PADS layer record size {{detail}}",
  ],
  padsInvalidPartRecordSize: [
    "PADS 器件记录尺寸无效 {{detail}}",
    "Invalid PADS component record size {{detail}}",
  ],
  padsInvalidLayerType: [
    "PADS 层类型无效 {{detail}}",
    "Invalid PADS layer type {{detail}}",
  ],
  padsMissingDefaultPad: [
    "PADS 缺少默认焊盘 {{detail}}",
    "PADS is missing default pad {{detail}}",
  ],
  padsInvalidPadMapping: [
    "PADS 引脚焊盘映射无效 {{detail}}",
    "Invalid PADS pin-to-pad mapping {{detail}}",
  ],
  padsInvalidPadReference: [
    "PADS 引脚焊盘引用无效 {{detail}}",
    "Invalid PADS pin pad reference {{detail}}",
  ],
  padsInvalidFootprintRecordSize: [
    "PADS 封装记录尺寸无效 {{detail}}",
    "Invalid PADS footprint record size {{detail}}",
  ],
  padsFootprintFieldOutOfBounds: [
    "PADS 封装字段越界 {{detail}}",
    "PADS footprint field is out of bounds at {{detail}}",
  ],
  padsPadFieldOutOfBounds: [
    "PADS 焊盘字段越界 {{detail}}",
    "PADS pad field is out of bounds at {{detail}}",
  ],
  padsJunctionFieldOutOfBounds: [
    "PADS 接点字段越界 {{detail}}",
    "PADS junction field is out of bounds at {{detail}}",
  ],
  padsRouteFieldOutOfBounds: [
    "PADS 走线字段越界 {{detail}}",
    "PADS route field is out of bounds at {{detail}}",
  ],
  padsInvalidFloat: [
    "PADS 浮点值无效 {{detail}}",
    "Invalid PADS floating-point value at {{detail}}",
  ],
  padsMissingLayerPad: [
    "PADS 逐层焊盘引用越界 {{detail}}",
    "PADS per-layer pad reference is out of bounds at {{detail}}",
  ],
  padsInvalidPourNet: [
    "PADS 铜区网络引用无效 {{detail}}",
    "Invalid PADS copper area net reference {{detail}}",
  ],
  padsThermalNetConflict: [
    "PADS 铜区与热连接网络冲突 {{detail}}",
    "PADS copper area and thermal relief have conflicting nets: {{detail}}",
  ],
  padsInvalidPourOwnerChain: [
    "PADS 铜区归属链无效 {{detail}}",
    "Invalid PADS copper area owner chain {{detail}}",
  ],
  padsPourTailMismatch: [
    "PADS 铜区链尾不匹配 {{detail}}",
    "PADS copper area chain tail does not match {{detail}}",
  ],
  padsUnownedPourRecord: [
    "PADS 铜区存在未归属或未知记录 {{detail}}",
    "PADS copper area has {{detail}} unowned or unknown records",
  ],
  padsInvalidPourPiece: [
    "PADS 铜区分段类型 {{detail}} 尚待核验",
    "PADS copper area segment type {{detail}} needs verification",
  ],
  padsInvalidCopperMesh: [
    "PADS 铜区 {{detail}} 没有可绘制几何",
    "PADS copper area {{detail}} has no drawable geometry",
  ],
  altiumInvalidLayerNumber: [
    "Altium 板层编号无效 {{detail}}",
    "Invalid Altium board layer number {{detail}}",
  ],
  altiumInvalidLegacyLayerValue: [
    "Altium 旧版层链值无效 {{detail}}",
    "Invalid Altium legacy layer chain value {{detail}}",
  ],
  altiumInvalidOutlineArc: [
    "Altium 板框圆弧 {{detail}} 无效",
    "Invalid Altium outline arc {{detail}}",
  ],
  altiumMissingProperty: [
    "Altium 缺少 {{detail}}",
    "Altium is missing {{detail}}",
  ],
  altiumInvalidCoordinate: [
    "Altium {{detail}} 坐标无效",
    "Invalid Altium {{detail}} coordinate",
  ],
  altiumInvalidUnit: [
    "Altium {{detail}} 单位无效: {{value}}",
    "Invalid Altium {{detail}} unit: {{value}}",
  ],
  altiumUndefinedNetName: [
    "Altium 网络 {{detail}} 缺少名称",
    "Altium net {{detail}} is missing a name",
  ],
  altiumNetOutOfBounds: [
    "Altium 网络引用越界 {{detail}}",
    "Altium net reference {{detail}} is out of bounds",
  ],
  altiumInvalidPropertyRecord: [
    "Altium 属性记录越界 {{detail}}",
    "Altium property record is out of bounds at {{detail}}",
  ],
  altiumPropertyCountMismatch: [
    "Altium 属性记录数量不符 {{detail}}",
    "Altium property record count does not match: {{detail}}",
  ],
  altiumWideStringDuplicate: [
    "Altium WideStrings6 重复编号 {{detail}}",
    "Duplicate Altium WideStrings6 index {{detail}}",
  ],
  altiumWideStringInvalidLength: [
    "Altium WideStrings6 项 {{detail}} 长度无效",
    "Altium WideStrings6 entry {{detail}} has an invalid length",
  ],
  altiumInvalidText: [
    "Altium Text {{detail}} 结构无效",
    "Altium Text {{detail}} has an invalid structure",
  ],
  altiumInvalidTextGeometry: [
    "Altium Text {{detail}} 尺寸或坐标无效",
    "Altium Text {{detail}} has invalid size or coordinates",
  ],
  altiumShortTrack: [
    "Altium Track 长度不足 @{{detail}}",
    "Altium Track is too short at byte {{detail}}",
  ],
  altiumShortArc: [
    "Altium Arc 长度不足 @{{detail}}",
    "Altium Arc is too short at byte {{detail}}",
  ],
  altiumShortVia: [
    "Altium Via 长度不足 @{{detail}}",
    "Altium Via is too short at byte {{detail}}",
  ],
  altiumShortFill: [
    "Altium Fill {{detail}} 长度不足",
    "Altium Fill {{detail}} is too short",
  ],
  altiumInvalidFill: [
    "Altium Fill {{detail}} 几何无效",
    "Altium Fill {{detail}} has invalid geometry",
  ],
  altiumShortRegion: [
    "Altium Region {{detail}} 长度不足",
    "Altium Region {{detail}} is too short",
  ],
  altiumInvalidRegionProperties: [
    "Altium Region {{detail}} 属性块无效",
    "Altium Region {{detail}} has invalid properties",
  ],
  altiumMissingRegionProperties: [
    "Altium Region {{detail}} 缺少属性",
    "Altium Region {{detail}} is missing properties",
  ],
  altiumInvalidRegionKind: [
    "Altium Region {{detail}} KIND 无效",
    "Altium Region {{detail}} has an invalid KIND",
  ],
  altiumTruncatedRegionVertices: [
    "Altium Region {{detail}} 顶点数量截断",
    "Altium Region {{detail}} vertex count is truncated",
  ],
  altiumTruncatedRegionData: [
    "Altium Region {{detail}} 顶点数据截断",
    "Altium Region {{detail}} vertex data is truncated",
  ],
  altiumInvalidRegionCoordinates: [
    "Altium Region {{detail}} 坐标无效",
    "Altium Region {{detail}} has invalid coordinates",
  ],
  altiumRegionTrailingBytes: [
    "Altium Region {{detail}} 剩余 {{value}} 字节",
    "Altium Region {{detail}} has {{value}} trailing bytes",
  ],
  brdDrawingPathChainLoop: [
    "尺寸图形 {{detail}} 路径链循环 {{value}}",
    "BRD dimension graphic {{detail}} path chain loops at {{value}}",
  ],
  brdDrawingOwnerChainLoop: [
    "尺寸图形所属链循环 {{detail}}",
    "BRD dimension graphic owner chain loops at {{detail}}",
  ],
  altiumInvalidRecordType: [
    "Altium 记录类型无效 @{{detail}}: {{value}} ≠ {{extra}}",
    "Invalid Altium record type at byte {{detail}}: {{value}} instead of {{extra}}",
  ],
  altiumPadInvalidNameLength: [
    "Altium Pad {{detail}} 名称字段长度无效",
    "Altium Pad {{detail}} has an invalid name field length",
  ],
  altiumPadShortRecord: [
    "Altium Pad {{detail}} 主记录长度不足",
    "Altium Pad {{detail}} main record is too short",
  ],
  altiumPadUnsupportedExtension: [
    "Altium Pad {{detail}} 扩展记录长度未支持 {{value}}",
    "Altium Pad {{detail}} has unsupported extension length {{value}}",
  ],
  altiumPadMissingSourceLayer: [
    "Altium Pad {{detail}} 层 {{value}} 缺少原始层号",
    "Altium Pad {{detail}} layer {{value}} is missing its source layer number",
  ],
  altiumPadUnsupportedStackMode: [
    "Altium Pad {{detail}} padstack 模式未支持 {{value}}",
    "Altium Pad {{detail}} has unsupported padstack mode {{value}}",
  ],
  altiumPadComponentOutOfBounds: [
    "Altium Pad {{detail}} 器件引用越界 {{value}}",
    "Altium Pad {{detail}} component reference {{value}} is out of bounds",
  ],
  altiumRegionPolygonOutOfBounds: [
    "Altium Region {{detail}} Polygon 引用越界 {{value}}",
    "Altium Region {{detail}} polygon reference {{value}} is out of bounds",
  ],
  altiumInvalidArcRadius: [
    "Altium Arc {{detail}} 半径无效",
    "Altium Arc {{detail}} has an invalid radius",
  ],
  altiumInvalidViaDrill: [
    "Altium Via {{detail}} 孔径无效",
    "Altium Via {{detail}} has an invalid drill diameter",
  ],
  altiumUnsupportedSingleLayerVia: [
    "Altium 单层 Via {{detail}} 不能转换为无孔铜焊盘",
    "Altium single-layer via {{detail}} cannot be converted to an undrilled copper pad",
  ],
  hfssUnverifiedRectangleRepresentation: [
    "HFSS 矩形表示 {{detail}} 尚待原生核验",
    "HFSS rectangle representation {{detail}} needs native verification",
  ],
  hfssUnreadablePrimitiveOutline: [
    "HFSS 无法读取图元轮廓 {{detail}}",
    "Could not read HFSS primitive outline {{detail}}",
  ],
  hfssUnsupportedNoncopperLayer: [
    "HFSS 非铜图元层尚待适配：{{detail}}",
    "HFSS noncopper primitive layer is unsupported: {{detail}}",
  ],
  hfssEmptyCopperArea: [
    "HFSS 空铜区 {{detail}}",
    "HFSS copper area {{detail}} is empty",
  ],
  hfssUnverifiedPrimitiveConversion: [
    "HFSS 图元 {{detail}} 的场景转换尚待核验",
    "HFSS primitive {{detail}} scene conversion needs verification",
  ],
  hfssPadMissingComponent: [
    "HFSS 焊盘引用缺失器件 {{detail}}",
    "HFSS pad refers to missing component {{detail}}",
  ],
  hfssUnparsedParameter: [
    "HFSS 尚未解析参数表达式：{{detail}}",
    "Unsupported HFSS parameter expression: {{detail}}",
  ],
  hfssMissingOrDuplicatePadstackCall: [
    "HFSS Padstack 缺少或重复 {{detail}}",
    "HFSS padstack call {{detail}} is missing or duplicated",
  ],
  hfssInvalidPadstackUsageLayer: [
    "HFSS Padstack 使用层无效 {{detail}}",
    "Invalid HFSS padstack usage layer {{detail}}",
  ],
  hfssInvalidPadstackFlipFlag: [
    "HFSS Padstack 镜像标志无效 {{detail}}",
    "Invalid HFSS padstack mirror flag {{detail}}",
  ],
  hfssNonstandardPadShape: [
    "HFSS 非标准焊盘形状 {{detail}}",
    "Nonstandard HFSS pad shape {{detail}}",
  ],
  hfssInvalidPadShapeDimensions: [
    "HFSS {{detail}} 焊盘尺寸无效",
    "HFSS {{detail}} pad has invalid dimensions",
  ],
  hfssUnsupportedDrillShape: [
    "HFSS 未支持钻孔形状 {{detail}}",
    "Unsupported HFSS drill shape {{detail}}",
  ],
  hfssInvalidPropertySyntax: [
    "HFSS 属性语法无效：{{detail}}",
    "Invalid HFSS property syntax near {{detail}}",
  ],
  kicadInvalidGraphicArc: [
    "KiCad 图形圆弧 @{{detail}}: {{value}}",
    "Invalid KiCad graphic arc at byte {{detail}}",
  ],
  kicadInvalidPolygonArc: [
    "KiCad 图形多边形圆弧 @{{detail}}: {{value}}",
    "Invalid KiCad graphic polygon arc at byte {{detail}}",
  ],
  kicadInvalidRouteArc: [
    "KiCad 圆弧 @{{detail}}: {{value}}",
    "Invalid KiCad route arc at byte {{detail}}",
  ],
  odbUnsupportedLayerFeature: [
    "ODB++ {{detail}} 层含有未支持的图元：{{value}}",
    "ODB++ {{detail}} layer has an unsupported feature: {{value}}",
  ],
  padsFootprintPinOutOfBounds: [
    "PADS 封装引脚引用越界 {{detail}}",
    "PADS footprint pin reference is out of bounds: {{detail}}",
  ],
  padsJunctionNetCountMismatch: [
    "PADS 接点关系网络数不符 {{detail}}",
    "PADS junction link net counts do not match: {{detail}}",
  ],
  padsFieldOutOfBounds: [
    "PADS 字段越界 {{detail}}",
    "PADS field is out of bounds at {{detail}}",
  ],
  padsInvalidViaSpan: [
    "PADS Via 层跨度无效 {{detail}}",
    "Invalid PADS via layer span {{detail}}",
  ],
  padsViaNetConflict: [
    "PADS Via 网络证据不一致 {{detail}}",
    "PADS via {{detail}} has inconsistent net evidence",
  ],
  strokeFontDownloadFailed: [
    "无法读取扩展笔画字体 {{detail}}：HTTP {{value}}",
    "Could not load extended stroke font {{detail}}: HTTP {{value}}",
  ],
  altiumUndefinedViaSpan: [
    "Altium Via {{detail}} 层跨度未定义 {{value}}",
    "Altium Via {{detail}} has undefined layer span {{value}}",
  ],
  hfssInvalidObjectType: [
    "HFSS 对象类型无效{{detail}}",
    "Invalid HFSS object type {{detail}}",
  ],
  kicadInvalidPadSize: [
    "KiCad 焊盘尺寸无效 @{{detail}} {{value}}",
    "Invalid KiCad pad size at byte {{detail}}",
  ],
  odbUndefinedMatrixLayer: [
    "ODB++ EDA 引用了 matrix 中未定义的层：{{detail}}",
    "ODB++ EDA refers to undefined matrix layer {{detail}}",
  ],
  padsInvalidOutlineVertexReference: [
    "PADS 板框顶点引用无效 {{detail}}",
    "Invalid PADS outline vertex reference: {{detail}}",
  ],
  padsAmbiguousRouteNet: [
    "PADS 走线网络证据不唯一 {{detail}}",
    "Ambiguous PADS route net evidence: {{detail}}",
  ],
} as const;

export function additionalParserErrors(
  language: "zh-CN" | "en",
): Record<string, string> {
  const index = language === "zh-CN" ? 0 : 1;
  return Object.fromEntries(
    [...Object.entries(messages), ...Object.entries(dynamicMessages)].map(
      ([key, values]) => [key, values[index]],
    ),
  );
}

const escapePattern = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const additionalParserErrorPatterns: readonly (readonly [
  RegExp,
  string,
])[] = Object.entries(dynamicMessages).map(([key, values]) => {
  const pattern = values[0]
    .split(/\{\{(?:detail|value|extra)\}\}/)
    .map(escapePattern)
    .join("([\\s\\S]+?)");
  return [new RegExp(`^${pattern}$`), key];
});
