import type { Layer } from "../../board/model";
import { parserError } from "../../parser-error";
import type { BrdDatabase } from "../database";
import type { AllegroBuildProgress } from "../build-progress";
import { isLayerListRecord } from "../binary/records/layers";
import { AllegroLayerDecoder } from "../decoders/layers";

const colors = [
  "#58b5ed",
  "#83ce94",
  "#edb963",
  "#ba8bec",
  "#eb819d",
  "#54c7bd",
  "#a5b8df",
  "#e18d61",
];
export async function readLayersAndNets(
  db: BrdDatabase,
  buildProgress: AllegroBuildProgress,
) {
  let earlyWork = 0;
  const layerList = db.get(db.header.layerMap[6]?.recordId);
  if (!isLayerListRecord(layerList)) throw parserError("brdMissingLayers");
  const layers: Layer[] = layerList.Entries.map((entry, id) => {
    const properties = "Properties" in entry ? entry.Properties : undefined;
    return {
      id,
      name:
        "Name" in entry
          ? entry.Name
          : (db.strings.get(entry.NameId) ?? `Layer ${id + 1}`),
      color: colors[id % colors.length],
      layerFunction: AllegroLayerDecoder.functionFromFlags(properties),
      sourceFlags: properties,
    };
  });
  const nets = new Map<number, string>();
  for (const net of db.records(0x1b)) {
    nets.set(net.Key, db.strings.get(net.NetName) ?? "");
    if ((++earlyWork & 255) === 0) {
      const pause = buildProgress.checkpoint();
      if (pause) await pause;
    }
  }
  return { layers, nets };
}
