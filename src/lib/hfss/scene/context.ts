import { BoundsAccumulator } from "../../board/bounds";
import type { BoardScene } from "../../board/model";
import { cooperative } from "../../cooperative";
import { parserError } from "../../parser-error";
import type { DefLayout } from "../metadata/layout";
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

/** One source conversion owns geometry, IDs, names and cancellation state. */
export function createHfssSceneContext(
  source: DefLayout,
  signal?: AbortSignal,
) {
  const copper = [...source.layers.values()].filter((l) => l.type === "signal");
  if (!copper.length) throw parserError("hfssNoCopper");
  const layerIds = new Map(copper.map((l, i) => [l.id, i]));
  const netIds = new Map([...source.nets.keys()].map((id, i) => [id, i + 1]));
  const netId = (id: number) => {
    if (id === -1) return 0;
    const mapped = netIds.get(id);
    if (mapped === undefined)
      throw parserError("hfssMissingNet", { detail: id });
    return mapped;
  };
  const extent = new BoundsAccumulator();
  const scene: BoardScene = {
    layers: copper.map((l, i) => ({
      id: i,
      name: l.name,
      color: colors[i % colors.length],
      layerFunction: "conductor",
    })),
    nets: new Map([...source.nets].map(([id, name]) => [netId(id), name])),
    segments: [],
    vias: [],
    pins: [],
    zones: [],
    outline: [],
    texts: [],
    drawingLayers: [],
    bounds: extent.bounds,
    diagnostics: [],
  };
  let nextId = 1;
  return {
    source,
    scene,
    extent,
    copper,
    layerIds,
    netId,
    signal,
    components: new Map<number, string>(),
    pause: cooperative(signal),
    nextId: () => nextId++,
  };
}
export type HfssSceneContext = ReturnType<typeof createHfssSceneContext>;
