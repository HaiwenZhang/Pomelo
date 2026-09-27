/** Read-only OLE Compound File container used by Altium PcbDoc. The directory
 * tree and both sector allocation tables are validated before exposing data. */
const FREE = 0xffffffff,
  END = 0xfffffffe,
  FAT = 0xfffffffd,
  DIFAT = 0xfffffffc;
export interface AltiumStream {
  path: string;
  size: number;
  directoryId: number;
}
interface Entry {
  name: string;
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
}
export class AltiumCompoundFile {
  readonly streams: AltiumStream[] = [];
  readonly sectorSize: number;
  readonly trailingBytes: number;
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly sectors: number;
  private readonly fat: Uint32Array;
  private readonly miniFat: Uint32Array;
  private readonly root: Entry;
  private readonly entries: Entry[];
  private readonly paths = new Map<string, number>();
  private miniStream: Uint8Array | null = null;
  private readonly miniCutoff: number;
  private readonly miniSectorSize: number;
  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    if (
      buffer.byteLength < 512 ||
      "D0CF11E0A1B11AE1" !==
        Array.from(this.bytes.subarray(0, 8), (n) =>
          n.toString(16).padStart(2, "0"),
        )
          .join("")
          .toUpperCase()
    )
      throw new Error("Altium 复合文件标记无效");
    const u16 = (at: number) => this.view.getUint16(at, true),
      u32 = (at: number) => this.view.getUint32(at, true);
    const major = u16(26),
      shift = u16(30),
      miniShift = u16(32);
    if (
      !((major === 3 && shift === 9) || (major === 4 && shift === 12)) ||
      miniShift !== 6 ||
      u16(28) !== 0xfffe
    )
      throw new Error("Altium 复合文件扇区格式无效");
    this.sectorSize = 2 ** shift;
    this.miniSectorSize = 2 ** miniShift;
    if (buffer.byteLength < this.sectorSize * 2)
      throw new Error("Altium 复合文件长度无效");
    this.trailingBytes = buffer.byteLength % this.sectorSize;
    // Some Altium saves trim unused bytes from the final data sector.
    this.sectors = Math.ceil(buffer.byteLength / this.sectorSize) - 1;
    this.miniCutoff = u32(56);
    if (this.miniCutoff !== 4096)
      throw new Error("Altium 复合文件小流阈值无效");
    const fatCount = u32(44),
      difatCount = u32(72),
      fatSectors: number[] = [];
    if (!fatCount || fatCount > this.sectors || difatCount > this.sectors)
      throw new Error("Altium FAT 数量无效");
    for (let i = 0; i < 109 && fatSectors.length < fatCount; i++) {
      const sector = u32(76 + i * 4);
      if (sector !== FREE) fatSectors.push(sector);
    }
    let difat = u32(68);
    const usedDifat = new Set<number>();
    for (let i = 0; i < difatCount; i++) {
      if (difat >= this.sectors || usedDifat.has(difat))
        throw new Error("Altium DIFAT 链无效");
      usedDifat.add(difat);
      const at = this.sectorOffset(difat);
      for (
        let j = 0;
        j < this.sectorSize / 4 - 1 && fatSectors.length < fatCount;
        j++
      ) {
        const sector = u32(at + j * 4);
        if (sector !== FREE) fatSectors.push(sector);
      }
      difat = u32(at + this.sectorSize - 4);
    }
    if (
      fatSectors.length !== fatCount ||
      difat !== END ||
      new Set(fatSectors).size !== fatSectors.length ||
      fatSectors.some((n) => n >= this.sectors || usedDifat.has(n))
    )
      throw new Error("Altium FAT 扇区目录无效");
    this.fat = new Uint32Array((fatSectors.length * this.sectorSize) / 4);
    for (let i = 0; i < fatSectors.length; i++)
      for (let j = 0; j < this.sectorSize / 4; j++)
        this.fat[(i * this.sectorSize) / 4 + j] = u32(
          this.sectorOffset(fatSectors[i]) + j * 4,
        );
    for (const sector of fatSectors)
      if (this.fat[sector] !== FAT)
        throw new Error("Altium FAT 自引用标记无效");
    for (const sector of usedDifat)
      if (this.fat[sector] !== DIFAT)
        throw new Error("Altium DIFAT 自引用标记无效");
    const directory = this.readSectors(
      u32(48),
      undefined,
      this.fat,
      this.sectorSize,
    );
    if (directory.length % 128) throw new Error("Altium 目录记录尺寸无效");
    const dirView = new DataView(
      directory.buffer,
      directory.byteOffset,
      directory.byteLength,
    );
    const decoder = new TextDecoder("utf-16le", { fatal: true });
    this.entries = [];
    for (let at = 0; at < directory.length; at += 128) {
      const nameBytes = dirView.getUint16(at + 64, true),
        type = dirView.getUint8(at + 66);
      if (
        nameBytes > 64 ||
        nameBytes % 2 ||
        ((type === 1 || type === 2 || type === 5) && nameBytes < 2)
      )
        throw new Error("Altium 目录名称无效");
      const name = type
        ? decoder.decode(directory.subarray(at, at + nameBytes - 2))
        : "";
      const sizeLow = dirView.getUint32(at + 120, true),
        sizeHigh = major === 3 ? 0 : dirView.getUint32(at + 124, true),
        size = sizeLow + sizeHigh * 2 ** 32;
      if (!Number.isSafeInteger(size)) throw new Error("Altium 数据流长度无效");
      this.entries.push({
        name,
        type,
        left: dirView.getUint32(at + 68, true),
        right: dirView.getUint32(at + 72, true),
        child: dirView.getUint32(at + 76, true),
        start: dirView.getUint32(at + 116, true),
        size,
      });
    }
    this.root = this.entries[0];
    if (!this.root || this.root.type !== 5)
      throw new Error("Altium 根目录无效");
    const miniCount = u32(64),
      miniBytes = miniCount
        ? this.readSectors(
            u32(60),
            miniCount * this.sectorSize,
            this.fat,
            this.sectorSize,
          )
        : new Uint8Array();
    if (miniBytes.length !== miniCount * this.sectorSize)
      throw new Error("Altium MiniFAT 长度无效");
    const miniView = new DataView(
      miniBytes.buffer,
      miniBytes.byteOffset,
      miniBytes.byteLength,
    );
    this.miniFat = new Uint32Array(miniBytes.length / 4);
    for (let i = 0; i < this.miniFat.length; i++)
      this.miniFat[i] = miniView.getUint32(i * 4, true);
    const visited = new Set<number>();
    const walk = (id: number, prefix: string) => {
      if (id === FREE) return;
      if (id >= this.entries.length || visited.has(id))
        throw new Error("Altium 目录树引用无效");
      visited.add(id);
      const entry = this.entries[id];
      if (!entry || ![1, 2].includes(entry.type))
        throw new Error("Altium 目录项类型无效");
      walk(entry.left, prefix);
      const path = prefix ? `${prefix}/${entry.name}` : entry.name,
        key = path.toLowerCase();
      if (this.paths.has(key)) throw new Error(`Altium 重复数据流 ${path}`);
      this.paths.set(key, id);
      if (entry.type === 1) walk(entry.child, path);
      else this.streams.push({ path, size: entry.size, directoryId: id });
      walk(entry.right, prefix);
    };
    walk(this.root.child, "");
  }
  read(path: string): Uint8Array {
    const id = this.paths.get(path.toLowerCase());
    if (id === undefined || this.entries[id].type !== 2)
      throw new Error(`Altium 数据流不存在：${path}`);
    const entry = this.entries[id];
    if (entry.size === 0) return new Uint8Array();
    if (entry.size >= this.miniCutoff)
      return this.readSectors(
        entry.start,
        entry.size,
        this.fat,
        this.sectorSize,
      );
    if (!this.miniStream)
      this.miniStream = this.readSectors(
        this.root.start,
        this.root.size,
        this.fat,
        this.sectorSize,
      );
    return this.readSectors(
      entry.start,
      entry.size,
      this.miniFat,
      this.miniSectorSize,
      this.miniStream,
    );
  }
  private sectorOffset(index: number) {
    if (index >= this.sectors) throw new Error(`Altium 扇区越界 ${index}`);
    return (index + 1) * this.sectorSize;
  }
  private readSectors(
    start: number,
    size: number | undefined,
    table: Uint32Array,
    unit: number,
    storage = this.bytes,
  ): Uint8Array {
    if (start === END && size === 0) return new Uint8Array();
    const chunks: number[] = [],
      seen = new Set<number>();
    let sector = start;
    while (sector !== END) {
      if (
        sector >= table.length ||
        seen.has(sector) ||
        sector === FREE ||
        sector === FAT ||
        sector === DIFAT
      )
        throw new Error("Altium 扇区链无效");
      seen.add(sector);
      chunks.push(sector);
      sector = table[sector];
      if (size !== undefined && chunks.length * unit >= size) {
        if (sector !== END) throw new Error("Altium 数据流链长于声明");
        break;
      }
    }
    const bytes = size ?? chunks.length * unit;
    if (chunks.length * unit < bytes) throw new Error("Altium 数据流截断");
    const output = new Uint8Array(bytes);
    for (let i = 0; i < chunks.length; i++) {
      const at =
        storage === this.bytes
          ? this.sectorOffset(chunks[i])
          : chunks[i] * unit;
      const length = Math.min(unit, bytes - i * unit);
      if (at < 0 || at > storage.length - length)
        throw new Error("Altium 小流扇区越界");
      output.set(storage.subarray(at, at + length), i * unit);
    }
    return output;
  }
}
