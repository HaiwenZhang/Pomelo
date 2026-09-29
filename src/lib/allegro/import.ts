import type { BrdTextEncoding } from "./binary/text-decoder";
import type { BrdDatabase } from "./database";
import { AllegroParser, type ParseProgress } from "./parser";
import { AllegroSceneBuilder } from "./scene-builder";
import type { BoardScene } from "../board/model";
import type { ImportedBoard } from "../import/model";
import type { ProgressReporter } from "../progress";

export interface AllegroImportDependencies {
  parseBrd: (
    buffer: ArrayBuffer,
    signal?: AbortSignal,
    progress?: (value: ParseProgress) => void,
    encoding?: BrdTextEncoding,
  ) => Promise<BrdDatabase>;
  buildScene: (
    database: BrdDatabase,
    signal?: AbortSignal,
    progress?: (phase: string) => void,
  ) => Promise<BoardScene>;
}

const defaults: AllegroImportDependencies = {
  parseBrd: (buffer, signal, progress, encoding) =>
    new AllegroParser(buffer, encoding).parse(signal, progress),
  buildScene: (database, signal, progress) =>
    new AllegroSceneBuilder(database).build(signal, progress),
};

/** Allegro-specific parsing, scene conversion and source encoding diagnostics. */
export async function importAllegro(
  buffer: ArrayBuffer,
  signal: AbortSignal,
  progress?: ProgressReporter,
  encoding: BrdTextEncoding = "utf-8",
  dependencies: AllegroImportDependencies = defaults,
): Promise<ImportedBoard> {
  const db = await dependencies.parseBrd(
    buffer,
    signal,
    (value) =>
      progress?.({
        phase:
          value.phase === "strings"
            ? "读取字符串表"
            : `解析对象 · ${value.count.toLocaleString()}`,
        fraction: 0.05 + value.fraction * 0.45,
      }),
    encoding,
  );
  signal.throwIfAborted();
  progress?.({ phase: "构建几何", fraction: 0.5 });
  const scene = await dependencies.buildScene(db, signal, (phase) =>
    progress?.({ phase }),
  );
  signal.throwIfAborted();
  if (db.textDecoder.issues.size) {
    const offsets = [...db.textDecoder.issues.keys()]
      .slice(0, 8)
      .map((offset) => `0x${offset.toString(16)}`)
      .join(", ");
    scene.diagnostics.push(
      `字符编码 ${encoding} 无法完整解读 ${db.textDecoder.issues.size} 处内容（偏移 ${offsets}）；可在文件信息中选择编码后重新读取。原始字节保留。`,
    );
  }
  return {
    scene,
    metadata: { format: "brd", header: db.header, records: db.count },
  };
}
