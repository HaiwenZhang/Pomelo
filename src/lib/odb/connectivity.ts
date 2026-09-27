import type { Point } from "../board/model";
import { cooperative } from "../cooperative";
import type { OdbArchive } from "./archive";
import { lines, number, unitScale } from "./text";
export interface Toeprint {
  reference: string;
  name: string;
  at: Point;
}
export interface Subnet {
  id: number;
  net: number;
  kind: string;
  toeprint?: Toeprint;
}
export class OdbConnectivityReader {
  constructor(
    private readonly archive: OdbArchive,
    private readonly step: string,
    private readonly units: string,
  ) {}
  async read(signal?: AbortSignal) {
    const { archive, step, units } = this;
    const toes = new Map<string, Toeprint>(),
      nets = new Map<number, string>(),
      features = new Map<string, Map<number, Subnet>>();
    const pause = cooperative(signal);
    let work = 0;
    for (const side of ["T", "B"]) {
      let component = -1,
        reference = "",
        scale = unitScale(units),
        toe = 0;
      const text = archive.text(
        `steps/${step}/layers/comp_+_${side === "T" ? "top" : "bot"}/components`,
        false,
      );
      for (const line of lines(text)) {
        if ((++work & 1023) === 0) {
          const pending = pause();
          if (pending) await pending;
        }
        if (line.startsWith("UNITS=")) {
          scale = unitScale(line.slice(6));
          continue;
        }
        const t = line.split(";")[0].trim().split(/\s+/);
        if (t[0] === "CMP") {
          component++;
          reference = t[6];
          toe = 0;
        } else if (t[0] === "TOP") {
          toes.set(`${side}:${component}:${toe++}`, {
            reference,
            name: t[8],
            at: [number(t[2]) * scale, number(t[3]) * scale],
          });
        }
      }
    }
    let netIndex = -1,
      net = 0,
      subnet: Subnet | undefined,
      layerNames: string[] = [],
      subnetId = 0;
    for (const line of lines(archive.text(`steps/${step}/eda/data`, false))) {
      if ((++work & 1023) === 0) {
        const pending = pause();
        if (pending) await pending;
      }
      const t = line.split(";")[0].trim().split(/\s+/);
      if (t[0] === "LYR") layerNames = t.slice(1).map((s) => s.toLowerCase());
      else if (t[0] === "NET") {
        netIndex++;
        net = t[1] === "$NONE$" ? 0 : netIndex + 1;
        if (net) nets.set(net, t[1]);
        subnet = undefined;
      } else if (t[0] === "SNT") {
        subnet = { id: ++subnetId, net, kind: t[1] };
        if (t[1] === "TOP") {
          subnet.toeprint = toes.get(`${t[2]}:${t[3]}:${t[4]}`);
          if (!subnet.toeprint) throw new Error(`ODB++ 引脚引用缺失：${line}`);
        }
      } else if (t[0] === "FID" && subnet) {
        const layer = layerNames[number(t[2])];
        if (!layer) throw new Error(`ODB++ FID 层未定义：${line}`);
        let map = features.get(layer);
        if (!map) features.set(layer, (map = new Map()));
        const index = number(t[3]),
          prior = map.get(index);
        if (prior && prior !== subnet)
          throw new Error(`ODB++ 图元有冲突网络引用：${layer}/${index}`);
        map.set(index, subnet);
      } else if (t[0] === "PKG") break;
    }
    signal?.throwIfAborted();
    return { nets, features, toes, subnetCount: subnetId };
  }
}
/** Compatibility entry point; parsing state belongs to OdbConnectivityReader. */
export async function readConnectivity(
  archive: OdbArchive,
  step: string,
  units: string,
  signal?: AbortSignal,
) {
  return new OdbConnectivityReader(archive, step, units).read(signal);
}
