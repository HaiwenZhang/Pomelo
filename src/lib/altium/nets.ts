import { altiumProperty, AltiumPropertyReader } from "./binary/properties";
/** Altium primitive net references are zero-based stream ordinals; scene net
 * zero remains the unconnected sentinel. */
export class AltiumNetReader {
  constructor(
    private readonly data: Uint8Array,
    private readonly count: number,
  ) {}
  async read(signal?: AbortSignal) {
    const { data, count } = this;
    const records = await new AltiumPropertyReader(data, count).read(signal),
      nets = new Map<number, string>();
    for (let i = 0; i < records.length; i++) {
      const name = altiumProperty(records[i], "NAME");
      if (name === undefined) throw new Error(`Altium 网络 ${i} 缺少名称`);
      nets.set(i + 1, name);
    }
    return nets;
  }
}
/** Compatibility entry point; parsing state belongs to AltiumNetReader. */
export async function readAltiumNets(
  data: Uint8Array,
  count: number,
  signal?: AbortSignal,
) {
  return new AltiumNetReader(data, count).read(signal);
}
export function altiumNetId(source: number, nets: Map<number, string>) {
  if (source === 0xffff) return 0;
  const id = source + 1;
  if (!nets.has(id)) throw new Error(`Altium 网络引用越界 ${source}`);
  return id;
}
