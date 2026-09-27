/** PADS SDB framing. Layout evidence: KiCad pads_sdb.cpp and local corpus.
 * This module resolves byte extents only; no geometry is inferred from counts. */
export interface PadsSection {
  index: number;
  count: number;
  declaredBytes: number;
  offset: number;
  bytes: number;
  records: number;
}
export interface PadsContainer {
  version: number;
  view: DataView;
  sections: PadsSection[];
  postLayerOffset: number;
  containerItemsOffset: number;
}
export class PadsContainerReader {
  constructor(private readonly buffer: ArrayBuffer) {}
  read(): PadsContainer {
    const { buffer } = this;
    const view = new DataView(buffer),
      size = buffer.byteLength;
    const range = (offset: number, bytes: number) => {
      if (
        !Number.isSafeInteger(offset) ||
        !Number.isSafeInteger(bytes) ||
        offset < 0 ||
        bytes < 0 ||
        offset > size - bytes
      )
        throw new Error(`PADS 数据越界 ${offset}+${bytes}/${size}`);
    };
    const u32 = (at: number) => {
      range(at, 4);
      return view.getUint32(at, true);
    };
    range(0, 52);
    if (view.getUint8(0) !== 0 || view.getUint8(1) !== 255)
      throw new Error("PADS 二进制签名无效");
    const version = view.getUint16(2, true);
    if (
      ![
        0x2011, 0x2017, 0x2019, 0x2020, 0x2021, 0x2022, 0x2024, 0x2025, 0x2026,
        0x2027,
      ].includes(version)
    )
      throw new Error(`PADS 版本 0x${version.toString(16)} 的布局尚待核验`);
    const footer = size - 42,
      guid = new TextDecoder().decode(new Uint8Array(buffer, footer, 38));
    if (guid !== "{2FE18320-6448-11d1-A412-000000000000}")
      throw new Error("PADS 尾部 GUID 无效");
    const containerItemsOffset = u32(size - 4);
    if (containerItemsOffset > footer - 4)
      throw new Error("PADS 容器尾指针无效");
    const count = u32(26);
    if (count < 72 || count > 256)
      throw new Error(`PADS 分节数量无效 ${count}`);
    range(10, count * 16);
    const sections = Array.from({ length: count }, (_, index): PadsSection => ({
      index,
      count: u32(10 + index * 16),
      declaredBytes: u32(14 + index * 16),
      offset: -1,
      bytes: 0,
      records: 0,
    }));
    let cursor = 6 + count * 16;
    const physical = (
      tag: number,
      bytes = sections[tag].declaredBytes,
      records = sections[tag].count,
    ) => {
      if (cursor > footer - bytes)
        throw new Error(`PADS 分节 ${tag} 超出数据区`);
      Object.assign(sections[tag], { offset: cursor, bytes, records });
      cursor += bytes;
    };
    for (let tag = 2; tag <= 27; tag++) {
      const stride =
        tag === 10
          ? version === 0x2011
            ? 96
            : version <= 0x2022
              ? 100
              : 112
          : tag === 11
            ? version === 0x2011
              ? 12
              : version <= 0x2024
                ? 16
                : 20
            : tag === 12
              ? 12
              : tag === 15
                ? version <= 0x2020
                  ? 20
                  : 36
                : tag === 24
                  ? version === 0x2011
                    ? 48
                    : 68
                  : 0;
      if (
        stride &&
        sections[tag].count * stride !== sections[tag].declaredBytes
      )
        throw new Error(`PADS 分节 ${tag} 记录尺寸不符`);
      physical(tag);
    }
    const pageTags = [65, 66, 45, 46, 47, 48, 41, 42, 74].filter(
        (t) => t < count,
      ),
      directory = sections[26];
    const pages = pageTags.reduce(
      (sum, t) => sum + sections[t].declaredBytes,
      0,
    );
    if (directory.count * 12 !== directory.bytes || pages > directory.count)
      throw new Error("PADS 分页目录无效");
    let descriptor = directory.offset + (directory.count - pages) * 12;
    for (const tag of pageTags) {
      let records = 0;
      for (let i = 0; i < sections[tag].declaredBytes; i++, descriptor += 12)
        records += u32(descriptor + 8);
      if (records > 0xffffffff) throw new Error("PADS 分页记录数溢出");
      sections[tag].records = records;
    }
    if (version === 0x2011)
      for (const tag of [45, 47, 48, 65, 66, 74])
        if (sections[tag]?.records)
          throw new Error(`PADS 0x2011 分页 ${tag} 布局尚待核验`);
    const stride = (tag: number) =>
      ({
        41: version === 0x2011 ? 176 : version === 0x2017 ? 180 : 188,
        42: version === 0x2011 ? 72 : 80,
        45: version === 0x2017 ? 116 : 124,
        46: version === 0x2011 ? 28 : version <= 0x2019 ? 32 : 40,
        47: 24,
        48: version <= 0x2019 ? 48 : version <= 0x2022 ? 856 : 864,
        65: 28,
        66: version <= 0x2022 ? 28 : 280,
        74: 276,
      })[tag]!;
    const paged = (tag: number) =>
      physical(tag, sections[tag].records * stride(tag), sections[tag].records);
    physical(29);
    for (const tag of [41, 42, 45, 46, 47, 48]) paged(tag);
    const rules = sections[46];
    let liveRules = 0;
    for (let i = 0; i < rules.records; i++) {
      const at = rules.offset + i * stride(46);
      if (u32(at) < 0x80000000 && u32(at + 4) !== 0) liveRules++;
    }
    physical(49);
    range(cursor, liveRules * 4);
    cursor += liveRules * 4;
    for (const tag of [
      51, 50, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64,
    ])
      physical(tag);
    paged(65);
    paged(66);
    physical(67);
    physical(68);
    physical(69, sections[69].declaredBytes + 12);
    physical(70, 4);
    if (sections[71].declaredBytes < 4)
      throw new Error("PADS 显示参数尺寸无效");
    physical(71, sections[71].declaredBytes - 4);
    for (const tag of [72, 73]) if (tag < count) physical(tag);
    if (count > 74) paged(74);
    if (cursor > containerItemsOffset - 15)
      throw new Error("PADS 层后数据区无效");
    if (
      view.getUint8(cursor + 4) !== 8 ||
      new TextDecoder().decode(new Uint8Array(buffer, cursor + 5, 8)) !==
        "PowerSYS"
    )
      throw new Error("PADS 层后标记无效");
    return {
      version,
      view,
      sections,
      postLayerOffset: cursor,
      containerItemsOffset,
    };
  }
}
/** Compatibility entry point; parsing state belongs to PadsContainerReader. */
export function readPadsContainer(buffer: ArrayBuffer): PadsContainer {
  return new PadsContainerReader(buffer).read();
}
