import { useCallback, useEffect, useRef, useState } from "react";
import type { BrdTextEncoding } from "../lib/allegro/binary/text-decoder";

import { BoardDisplay } from "../lib/board/display";

import type { Renderer } from "../lib/render/renderer";
import { WebGPURenderer } from "../lib/render/webgpu-renderer";
import { viewerStore } from "../lib/viewer-store";

/** Owns the GPU surface for one mounted viewer and disposes it on unmount. */
export function useBoardSurface(encoding: BrdTextEncoding) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<Renderer | null>(null);
  const [readyRenderer, setReadyRenderer] = useState<Renderer | null>(null);
  const sourceFile = useRef<File | null>(null);

  useEffect(() => {
    const initialization = new AbortController();
    let stopped = false;
    let surface: Renderer | undefined;
    const state = viewerStore.getState();
    void WebGPURenderer.create(
      canvas.current!,
      (message) => {
        state.setGpuError(message);
        state.setGpu("不可用");
      },
      initialization.signal,
      state.setSelection,
      state.setSelectionTask,
    )
      .then((value) => {
        if (stopped) value.dispose();
        else {
          surface = value;
          renderer.current = value;
          setReadyRenderer(value);
          state.setGpu("已就绪");
        }
      })
      .catch((error) => {
        if (!stopped) {
          state.setGpuError(
            String(error instanceof Error ? error.message : error),
          );
          state.setGpu("不可用");
        }
      });
    return () => {
      stopped = true;
      initialization.abort();
      surface?.dispose();
      if (renderer.current === surface) renderer.current = null;
      viewerStore.getState().cancel();
    };
  }, []);

  // Forward renderer settings directly; a visibility toggle need not rerender the workspace.
  useEffect(
    () =>
      viewerStore.subscribe((state, previous) => {
        const surface = renderer.current;
        if (!surface) return;
        const initialized = state.gpu !== previous.gpu;
        if (initialized || state.display !== previous.display)
          surface.setDisplay(state.display);
        if (
          state.scene &&
          (initialized || state.colorMode !== previous.colorMode)
        )
          surface.setColorMode(state.colorMode);
        if (initialized || state.flipped !== previous.flipped)
          surface.setFlipped(state.flipped);
        if (
          initialized ||
          state.pickFilter !== previous.pickFilter ||
          state.selectionMode !== previous.selectionMode
        )
          surface.setInteraction({
            filter: state.pickFilter,
            mode: state.selectionMode,
          });
      }),
    [],
  );

  const openFile = useCallback(
    (source?: File) => {
      if (!source) return;
      const surface = renderer.current;
      const state = viewerStore.getState();
      if (!surface || state.gpu !== "已就绪") {
        state.setError("请等待 WebGPU 就绪后打开文件");
        return;
      }
      sourceFile.current = source;
      return state.open(
        source,
        {
          clear: () => surface.setScene(null),
          prepare: (scene, signal, progress) => {
            surface.setDisplay(
              BoardDisplay.createDisplayOptions(scene.drawingLayers),
            );
            surface.setColorMode(viewerStore.getState().colorMode);
            surface.setFlipped(false);
            return surface.prepareScene(scene, signal, progress);
          },
        },
        encoding,
      );
    },
    [encoding],
  );

  return { canvas, renderer: readyRenderer, sourceFile, openFile };
}
