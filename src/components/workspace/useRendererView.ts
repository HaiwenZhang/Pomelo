import { useSyncExternalStore } from "react";
import type { Renderer, ViewState } from "../../lib/render/renderer";

const emptyView: ViewState = { zoom: 100, pixelsPerMm: 10 };
const emptySnapshot = () => emptyView;
const emptySubscribe = () => () => {};

/** Only view controls subscribe to camera changes; the workspace and board data stay quiet. */
export function useRendererView(renderer: Renderer | null) {
  return useSyncExternalStore(
    renderer?.subscribeView ?? emptySubscribe,
    renderer?.getView ?? emptySnapshot,
    emptySnapshot,
  );
}
