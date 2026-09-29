import type { BrdHeader } from "../allegro/binary/header";
import type { BrdTextEncoding } from "../allegro/binary/text-decoder";
import type { AltiumInfo } from "../altium/import";
import type { BoardScene } from "../board/model";
import type { SearchItem } from "../board/search";
import type { HfssInfo } from "../hfss/import";
import type { KiCadInfo } from "../kicad/import";
import type { OdbInfo } from "../odb/import";
import type { PadsInfo } from "../pads/import";
import type { ProgressReporter } from "../progress";

type BoardFileFormat =
  | { format?: "brd"; header: BrdHeader }
  | { format: "odb"; odb: OdbInfo }
  | { format: "hfss"; hfss: HfssInfo }
  | { format: "pads"; pads: PadsInfo }
  | { format: "kicad"; kicad: KiCadInfo }
  | { format: "altium"; altium: AltiumInfo };

export type BoardFileMetadata = { records: number } & BoardFileFormat;
export type BoardFile = BoardFileMetadata & {
  name: string;
  size: number;
  encoding: BrdTextEncoding;
};
export type BoardSource = Pick<File, "name" | "size" | "arrayBuffer">;

export interface ImportedBoard {
  scene: BoardScene;
  metadata: BoardFileMetadata;
}

export interface LoadedBoard {
  scene: BoardScene;
  searchItems: SearchItem[];
  file: BoardFile;
}

export type BoardImporter = (
  name: string,
  buffer: ArrayBuffer,
  signal: AbortSignal,
  progress: ProgressReporter | undefined,
  encoding: BrdTextEncoding,
) => Promise<ImportedBoard>;

export type BoardLoader = (
  source: BoardSource,
  signal: AbortSignal,
  progress?: ProgressReporter,
  encoding?: BrdTextEncoding,
) => Promise<LoadedBoard>;
