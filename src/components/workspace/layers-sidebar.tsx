import { ChevronLeft, Layers3 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { viewerStore } from "../../lib/viewer-store";
import { BoardLayers } from "../../lib/board/layers";
import type { Renderer } from "../../lib/render/renderer";
import { BoardSearch } from "../board-search";
import { DisplayOrderPanel } from "../display-order-panel";
import { LayersPanel } from "../layers-panel";
import { Button } from "../ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";

interface LayersSidebarProps {
  open: boolean;
  onToggle: () => void;
  renderer: Renderer | null;
}

export function LayersSidebar({
  open,
  onToggle,
  renderer,
}: LayersSidebarProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("layers");
  const { scene, file, display, searchItems, setDisplay, setSelectionMode } =
    useStore(
      viewerStore,
      useShallow(
        ({
          scene,
          file,
          display,
          searchItems,
          setDisplay,
          setSelectionMode,
        }) => ({
          scene,
          file,
          display,
          searchItems,
          setDisplay,
          setSelectionMode,
        }),
      ),
    );
  return (
    <aside
      id="layers-panel"
      className="sidebar floating-panel"
      hidden={!open}
      aria-label={t("workspace.layers")}
    >
      <div className="panel-heading">
        <h2>{t("workspace.layers")}</h2>
        <span className="count">
          {scene ? new BoardLayers(scene).all().length : 0}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="panel-collapse"
          aria-label={t("workspace.collapseLayers")}
          aria-controls="layers-panel"
          aria-expanded={open}
          onClick={onToggle}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
      </div>
      <div className="sidebar-search">
        <BoardSearch
          key={file?.name}
          items={searchItems}
          onLocate={(item) => {
            setSelectionMode(item.kind);
            void renderer?.locate(item);
          }}
        />
      </div>
      <Tabs value={tab} onValueChange={setTab} className="panel-tabs">
        <TabsList className="panel-tab-list" aria-label={t("workspace.layers")}>
          <TabsTrigger value="layers">{t("workspace.layers")}</TabsTrigger>
          <TabsTrigger value="order">{t("order.label")}</TabsTrigger>
        </TabsList>
        <div className="panel-scroll">
          {scene ? (
            <>
              <TabsContent value="layers">
                <LayersPanel
                  scene={scene}
                  display={display}
                  setDisplay={setDisplay}
                />
              </TabsContent>
              <TabsContent value="order">
                <DisplayOrderPanel
                  scene={scene}
                  display={display}
                  setDisplay={setDisplay}
                />
              </TabsContent>
            </>
          ) : (
            <div className="panel-empty">
              <Layers3 aria-hidden="true" />
              <b>{t("workspace.start")}</b>
              <p>{t("workspace.startHint")}</p>
            </div>
          )}
        </div>
      </Tabs>
      <div className="sidebar-bottom">
        <span>
          {t("workspace.layerCount", { count: scene?.layers.length ?? 0 })}
        </span>
        <span>mm</span>
      </div>
    </aside>
  );
}
