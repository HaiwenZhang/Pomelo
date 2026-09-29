import type { BoardScene } from "../board/model";
import { parserError } from "../parser-error";
import { DefReader } from "./binary/def";
import { DefLayoutReader } from "./metadata/layout";
import { DefPadstackReader } from "./metadata/padstack";
import { createHfssSceneContext } from "./scene/context";
import { readHfssComponents } from "./scene/components";
import { buildHfssPrimitives } from "./scene/primitives";
import { buildHfssPads } from "./scene/pads";
export interface HfssInfo {
  version: string;
  cell: string;
  bytes: number;
  sourcePrimitives: number;
  voids: number;
  padstacks: number;
}
/** Parse the typed archive, then coordinate independent source conversion stages. */
export async function importHfss(
  buffer: ArrayBuffer,
  signal?: AbortSignal,
  progress?: (phase: string) => void,
): Promise<{ scene: BoardScene; info: HfssInfo }> {
  const db = await new DefReader(buffer).read(signal, progress);
  progress?.("读取 HFSS 层、网络与 Padstack");
  const source = await new DefLayoutReader(db).read(signal);
  const padstacks = new DefPadstackReader(db, source).read();
  const context = createHfssSceneContext(source, signal);
  await readHfssComponents(context);
  progress?.("构建 HFSS 走线与铜区");
  await buildHfssPrimitives(context);
  progress?.("构建 HFSS 焊盘与钻孔");
  await buildHfssPads(context, padstacks);
  const { scene, extent } = context;
  if (!extent.finite) throw parserError("hfssNoGeometry");
  signal?.throwIfAborted();
  return {
    scene,
    info: {
      version: db.version,
      cell: source.name,
      bytes: db.bytes,
      sourcePrimitives: source.primitives.size,
      voids: [...source.voids.values()].reduce(
        (sum, values) => sum + values.length,
        0,
      ),
      padstacks: scene.pins.length + scene.vias.length,
    },
  };
}
