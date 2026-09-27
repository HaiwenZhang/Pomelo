import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import type { Point } from "../../lib/board/model";
import {
  coordinateUnit,
  formatCursorPoint,
  scaleBarSize,
  type CoordinateUnit,
} from "../../lib/interaction/cursor-coordinate";
import type { Renderer } from "../../lib/render/renderer";
import { viewerStore } from "../../lib/viewer-store";
import { useRendererView } from "./useRendererView";

export function WorkspaceStatus({ renderer }: { renderer: Renderer | null }) {
  const { i18n } = useTranslation();
  const scene = useStore(viewerStore, (state) => state.scene);
  const file = useStore(viewerStore, (state) => state.file);
  const [cursor, setCursor] = useState<Point | null>(null);
  const lastClient = useRef<Point | null>(null);

  useEffect(() => {
    if (!renderer) return;
    const update = (event: PointerEvent | WheelEvent) => {
      lastClient.current = [event.clientX, event.clientY];
      setCursor(renderer.getBoardPoint(event.clientX, event.clientY));
    };
    const refresh = () => {
      const client = lastClient.current;
      if (client) setCursor(renderer.getBoardPoint(client[0], client[1]));
    };
    const leave = () => {
      lastClient.current = null;
      setCursor(null);
    };
    renderer.canvas.addEventListener("pointermove", update);
    renderer.canvas.addEventListener("wheel", update);
    renderer.canvas.addEventListener("pointerleave", leave);
    const unsubscribe = renderer.subscribeView(refresh);
    return () => {
      renderer.canvas.removeEventListener("pointermove", update);
      renderer.canvas.removeEventListener("wheel", update);
      renderer.canvas.removeEventListener("pointerleave", leave);
      unsubscribe();
    };
  }, [renderer]);

  useEffect(() => {
    if (!scene) setCursor(null);
    else if (lastClient.current && renderer)
      setCursor(
        renderer.getBoardPoint(lastClient.current[0], lastClient.current[1]),
      );
  }, [scene, renderer]);

  const sourceUnits =
    file?.format === "odb"
      ? file.odb.units
      : file && (file.format === undefined || file.format === "brd")
        ? file.header.units
        : undefined;
  const unit = coordinateUnit(file?.format, sourceUnits);
  return (
    <footer className="workspace-status">
      <span className="cursor-coordinates">
        {scene ? formatCursorPoint(cursor, unit, i18n.language) : "X: —  Y: —"}
      </span>
      {scene ? <ScaleBar renderer={renderer} unit={unit} /> : null}
    </footer>
  );
}

function ScaleBar({
  renderer,
  unit,
}: {
  renderer: Renderer | null;
  unit: CoordinateUnit;
}) {
  const { pixelsPerMm } = useRendererView(renderer);
  const { length, width } = scaleBarSize(pixelsPerMm, unit);
  return (
    <span className="scale-bar" style={{ width }}>
      <span>
        {Number(length.toPrecision(2))} {unit.label}
      </span>
    </span>
  );
}
