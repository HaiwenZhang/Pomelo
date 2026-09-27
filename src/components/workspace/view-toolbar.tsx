import { Hand, Minus, MousePointer2, Plus, Scan } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import type { NavigationTool, Renderer } from "../../lib/render/renderer";
import { viewerStore } from "../../lib/viewer-store";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { useRendererView } from "./useRendererView";

interface ViewToolbarProps {
  renderer: Renderer | null;
}
const zoomPresets = [25, 50, 75, 100, 150, 200, 400];

export function ViewToolbar({ renderer }: ViewToolbarProps) {
  const { t } = useTranslation();
  const hasScene = useStore(viewerStore, (state) => state.scene !== null);
  const colorMode = useStore(viewerStore, (state) => state.colorMode);
  const [tool, setTool] = useState<NavigationTool>("select");
  const view = useRendererView(renderer);
  const zoom = Number(view.zoom.toFixed(2));

  useEffect(() => {
    renderer?.setNavigationTool(tool);
  }, [renderer, tool]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (event.target instanceof HTMLElement &&
          event.target.closest("input,select,textarea,[contenteditable=true]"))
      )
        return;
      if (event.key.toLowerCase() === "h") setTool("pan");
      if (event.key.toLowerCase() === "v") setTool("select");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <nav
      className="view-tools floating-surface"
      aria-label={t("workspace.viewTools")}
    >
      <ToggleGroup
        type="single"
        value={tool}
        onValueChange={(value) => {
          if (value === "select" || value === "pan") setTool(value);
        }}
        className="navigation-tools"
        aria-label={t("workspace.navigation")}
        disabled={!hasScene}
      >
        <ToggleGroupItem
          value="select"
          aria-label={t("workspace.selectTool")}
          title={`${t("workspace.selectTool")} (V)`}
          aria-keyshortcuts="V"
        >
          <MousePointer2 aria-hidden="true" />
        </ToggleGroupItem>
        <ToggleGroupItem
          value="pan"
          aria-label={t("workspace.panTool")}
          title={`${t("workspace.panTool")} (H)`}
          aria-keyshortcuts="H"
        >
          <Hand aria-hidden="true" />
        </ToggleGroupItem>
      </ToggleGroup>
      <Separator />
      <div className="zoom-controls">
        <Button
          variant="ghost"
          size="tool"
          disabled={!hasScene}
          aria-label={t("workspace.zoomOut")}
          title={t("workspace.zoomOut")}
          onClick={() => renderer?.zoom(1 / 1.5)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <select
          aria-label={t("workspace.zoomLevel")}
          title={t("workspace.zoomHint")}
          value={zoom}
          disabled={!hasScene}
          onChange={(event) =>
            renderer?.zoom(Number(event.target.value) / view.zoom)
          }
        >
          {!zoomPresets.includes(zoom) ? (
            <option value={zoom}>{zoom}%</option>
          ) : null}
          {zoomPresets.map((value) => (
            <option key={value} value={value}>
              {value}%
            </option>
          ))}
        </select>
        <Button
          variant="ghost"
          size="tool"
          disabled={!hasScene}
          aria-label={t("workspace.zoomIn")}
          title={t("workspace.zoomIn")}
          onClick={() => renderer?.zoom(1.5)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      <Button
        variant="ghost"
        className="fit-button"
        disabled={!hasScene}
        aria-label={`${t("workspace.fit")} F2`}
        title={`${t("workspace.fit")} (F2)`}
        onClick={() => renderer?.fit()}
      >
        <Scan aria-hidden="true" />
        <span>{t("workspace.fitShort")}</span>
      </Button>
      <Separator />
      <div
        className="color-mode-controls"
        role="group"
        aria-label={t("workspace.colorMode")}
      >
        <span className="color-mode-label">
          <span className="color-mode-label-full">
            {t("workspace.colorMode")}
          </span>
          <span className="color-mode-label-short">
            {t("workspace.colorModeShort")}
          </span>
        </span>
        <Button
          variant="ghost"
          className="color-mode-button"
          disabled={!hasScene}
          aria-label={t("workspace.colorByLayer")}
          aria-pressed={colorMode === "layer"}
          title={t("workspace.colorByLayer")}
          onClick={() => viewerStore.getState().setColorMode("layer")}
        >
          {t("workspace.layerShort")}
        </Button>
        <Button
          variant="ghost"
          className="color-mode-button"
          disabled={!hasScene}
          aria-label={t("workspace.colorByNet")}
          aria-pressed={colorMode === "net"}
          title={t("workspace.colorByNet")}
          onClick={() => viewerStore.getState().setColorMode("net")}
        >
          {t("workspace.netShort")}
        </Button>
      </div>
    </nav>
  );
}
