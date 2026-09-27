import { cooperative } from "../cooperative";
export interface ArchiveLimits {
  bytes: number;
  entries: number;
  entryBytes: number;
}
export const archiveLimits: ArchiveLimits = {
  bytes: 512 * 1024 * 1024,
  entries: 100000,
  entryBytes: 256 * 1024 * 1024,
};
const decoder = new TextDecoder("utf-8", { fatal: true });
function string(bytes: Uint8Array) {
  return decoder.decode(bytes).replace(/\0.*$/s, "");
}
function octal(bytes: Uint8Array) {
  const s = string(bytes).trim();
  if (!/^[0-7]*$/.test(s)) throw new Error("ODB++ TAR 数值字段无效");
  const n = parseInt(s || "0", 8);
  if (!Number.isSafeInteger(n)) throw new Error("ODB++ TAR 数值超出范围");
  return n;
}
function safePath(path: string) {
  const p = path.replace(/^(\.\/)+/, "").replace(/\/$/, "");
  if (
    !p ||
    p.startsWith("/") ||
    p.includes("\\") ||
    p.includes(":") ||
    p.split("/").some((x) => !x || x === ".." || x === ".")
  )
    throw new Error(`ODB++ TAR 路径无效：${path}`);
  return p.toLowerCase();
}
/** No filesystem extraction, network, Worker, or unbounded decompression. */
export class OdbArchiveReader {
  constructor(private readonly buffer: ArrayBuffer) {}
  async read(
    signal?: AbortSignal,
    progress?: (phase: string) => void,
    limits = archiveLimits,
  ) {
    const { buffer } = this;
    signal?.throwIfAborted();
    let data = new Uint8Array(buffer);
    if (data[0] === 0x1f && data[1] === 0x8b) {
      progress?.("解压 ODB++ 归档");
      const reader = new Blob([buffer])
        .stream()
        .pipeThrough(new DecompressionStream("gzip"))
        .getReader();
      const cancel = () => {
        void reader.cancel().catch(() => {});
      };
      signal?.addEventListener("abort", cancel, { once: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          signal?.throwIfAborted();
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limits.bytes)
            throw new Error("ODB++ 解包超过 512 MiB 限额");
          chunks.push(value);
        }
        signal?.throwIfAborted();
        data = new Uint8Array(size);
        const pause = cooperative(signal);
        let offset = 0;
        for (const chunk of chunks) {
          data.set(chunk, offset);
          offset += chunk.length;
          const pending = pause();
          if (pending) await pending;
        }
      } finally {
        signal?.removeEventListener("abort", cancel);
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
    }
    if (data.length > limits.bytes) throw new Error("ODB++ TAR 超出大小限额");
    const files = new Map<string, Uint8Array>();
    const pause = cooperative(signal);
    let offset = 0,
      entries = 0,
      longName = "",
      ended = false;
    progress?.("索引 ODB++ 归档");
    while (offset + 512 <= data.length) {
      signal?.throwIfAborted();
      const h = data.subarray(offset, offset + 512);
      if (h.every((v) => v === 0)) {
        ended = true;
        break;
      }
      if (++entries > limits.entries)
        throw new Error("ODB++ TAR 文件数量超出限额");
      let sum = 0;
      for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : h[i];
      if (sum !== octal(h.subarray(148, 156)))
        throw new Error(`ODB++ TAR 校验失败：${offset}`);
      const size = octal(h.subarray(124, 136)),
        type = h[156],
        body = offset + 512;
      if (size > limits.entryBytes || body + size > data.length)
        throw new Error(`ODB++ TAR 文件截断或过大：${offset}`);
      let name = longName || string(h.subarray(0, 100));
      longName = "";
      const prefix = string(h.subarray(345, 500));
      if (prefix && string(h.subarray(257, 263)).startsWith("ustar"))
        name = `${prefix}/${name}`;
      if (type === 76)
        longName = string(data.subarray(body, body + size)); // GNU long pathname
      else if (type === 0 || type === 48) {
        const path = safePath(name);
        if (files.has(path)) throw new Error(`ODB++ TAR 重复路径：${path}`);
        files.set(path, data.subarray(body, body + size));
      } else if (type !== 53)
        throw new Error(
          `ODB++ TAR 不支持的条目类型 ${String.fromCharCode(type)}：${name}`,
        );
      offset = body + Math.ceil(size / 512) * 512;
      const pending = pause();
      if (pending) await pending;
    }
    if (!ended || longName) throw new Error("ODB++ TAR 缺少结束记录");
    const matrices = [...files.keys()].filter(
      (p) => p === "matrix/matrix" || p.endsWith("/matrix/matrix"),
    );
    if (matrices.length !== 1)
      throw new Error(
        `需要一个 ODB++ matrix/matrix，找到 ${matrices.length} 个`,
      );
    const root = matrices[0].slice(0, -"matrix/matrix".length);
    return new OdbArchive(files, root, data.length);
  }
}
/** Compatibility entry point; parsing state belongs to OdbArchiveReader. */
export async function readOdbArchive(
  buffer: ArrayBuffer,
  signal?: AbortSignal,
  progress?: (phase: string) => void,
  limits = archiveLimits,
) {
  return new OdbArchiveReader(buffer).read(signal, progress, limits);
}
/** Validated archive storage and strict text access, scoped to one input. */
export class OdbArchive {
  readonly opaqueProperties: {
    path: string;
    offset: number;
    bytes: Uint8Array;
  }[] = [];
  constructor(
    readonly files: Map<string, Uint8Array>,
    readonly root: string,
    readonly bytes: number,
  ) {}
  text(path: string, required = true) {
    const { files, root, opaqueProperties } = this;
    const bytes = files.get(root + path.toLowerCase());
    if (!bytes) {
      if (required) throw new Error(`ODB++ 缺少文件：${path}`);
      return "";
    }
    try {
      return decoder.decode(bytes);
    } catch {
      // Some exporters put legacy-encoded descriptions/owners in PRP lines.
      // These are not geometry or reference names. Keep their exact bytes;
      // never guess a charset or replace bytes in a parsed geometric record.
      const chunks: string[] = [];
      let start = 0;
      for (let end = 0; end <= bytes.length; end++)
        if (end === bytes.length || bytes[end] === 10) {
          const line = bytes.subarray(start, end);
          try {
            chunks.push(decoder.decode(line));
          } catch {
            const prefix = new TextDecoder("ascii").decode(
              line.subarray(0, Math.min(100, line.length)),
            );
            if (
              prefix.startsWith("PRP ") &&
              (path.endsWith("/components") || path.endsWith("/eda/data"))
            ) {
              opaqueProperties.push({
                path,
                offset: start,
                bytes: line.slice(),
              });
            } else if (/^&\d+\s/.test(prefix)) {
              opaqueProperties.push({
                path,
                offset: start,
                bytes: line.slice(),
              });
              const key = /^&\d+/.exec(prefix)![0];
              chunks.push(`${key} [raw-bytes:${start}]`);
            } else if (
              prefix.startsWith("CMP ") &&
              path.endsWith("/components")
            ) {
              // Only the final part-name token may be opaque. Position,
              // orientation and the reference designator remain strict UTF-8.
              const spaces: number[] = [];
              for (let i = 0; i < line.length; i++)
                if (line[i] === 32) spaces.push(i);
              if (spaces.length < 7)
                throw new Error(`ODB++ 器件记录无效：${path}:${start}`);
              const head = decoder.decode(line.subarray(0, spaces[6]));
              opaqueProperties.push({
                path,
                offset: start,
                bytes: line.slice(),
              });
              chunks.push(`${head} [raw-part-name:${start}]`);
            } else
              throw new Error(`ODB++ 几何/引用记录编码无效：${path}:${start}`);
          }
          start = end + 1;
        }
      return chunks.join("\n");
    }
  }
}
