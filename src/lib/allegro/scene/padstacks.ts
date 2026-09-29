import type { AllegroRecord } from "../binary/record-types";
import { AllegroPadDecoder } from "../decoders/pad";
import { AllegroPadstackResolver } from "../decoders/padstack";
import type { AllegroSceneContext } from "./context";

export interface AllegroPadstacks {
  stacks: ReadonlyMap<number, AllegroRecord<0x1c>>;
  padDecoder: AllegroPadDecoder;
  padstacks: AllegroPadstackResolver;
}

export async function readPadstacks(
  context: AllegroSceneContext,
): Promise<AllegroPadstacks> {
  const {
    database: db,
    geometry,
    scale,
    diagnostics,
    layers,
    buildProgress,
  } = context;
  let earlyWork = 0;
  const stacks = new Map<number, AllegroRecord<0x1c>>();
  buildProgress.begin("读取 Padstack");
  for (const stack of db.records(0x1c)) {
    stacks.set(stack.Key, stack);
    if ((++earlyWork & 31) === 0) {
      const pause = buildProgress.checkpoint();
      if (pause) await pause;
    }
  }
  const padDecoder = new AllegroPadDecoder(geometry, scale, diagnostics);
  const getStackRecord = (id: number) => stacks.get(id) ?? db.get(id);
  const padstacks = new AllegroPadstackResolver(
    getStackRecord,
    layers.length,
    db.header.version,
  );
  return { stacks, padDecoder, padstacks };
}
