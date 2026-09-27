import { ChevronRight } from "lucide-react";
import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { BrdTextEncoding } from "../../lib/allegro/binary/text-decoder";
import type { Renderer } from "../../lib/render/renderer";
import { viewerStore } from "../../lib/viewer-store";
import { DisplayControls } from "../display-controls";
import { ObjectInspector } from "../object-inspector";
import { Button } from "../ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import { FileDetails } from "./file-details";

interface InspectorSidebarProps {
  open: boolean;
  onToggle: () => void;
  renderer: Renderer | null;
  encoding: BrdTextEncoding;
  onEncodingChange: (encoding: BrdTextEncoding) => void;
  onReload: () => void;
  sourceFile: RefObject<File | null>;
}

export function InspectorSidebar({
  open,
  onToggle,
  renderer,
  ...fileProps
}: InspectorSidebarProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState("inspect");
  const {
    scene,
    selection,
    selectionTask,
    pickFilter,
    selectionMode,
    setPickFilter,
    setSelectionMode,
  } = useStore(
    viewerStore,
    useShallow(
      ({
        scene,
        selection,
        selectionTask,
        pickFilter,
        selectionMode,
        setPickFilter,
        setSelectionMode,
      }) => ({
        scene,
        selection,
        selectionTask,
        pickFilter,
        selectionMode,
        setPickFilter,
        setSelectionMode,
      }),
    ),
  );
  return (
    <aside
      id="inspector-panel"
      className="inspector floating-panel"
      hidden={!open}
      aria-label={t("workspace.inspector")}
    >
      <Tabs value={tab} onValueChange={setTab} className="panel-tabs">
        <div className="inspector-header">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("workspace.collapseInspector")}
            aria-controls="inspector-panel"
            aria-expanded={open}
            onClick={onToggle}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <TabsList
            className="panel-tab-list"
            aria-label={t("workspace.inspector")}
          >
            <TabsTrigger value="inspect">
              {t("workspace.inspectTab")}
            </TabsTrigger>
            <TabsTrigger value="display">
              {t("workspace.displayTab")}
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="inspector-body panel-scroll">
          <TabsContent value="inspect">
            {scene ? (
              <ObjectInspector
                scene={scene}
                selection={selection}
                task={selectionTask}
                filter={pickFilter}
                mode={selectionMode}
                onFilter={setPickFilter}
                onMode={setSelectionMode}
                onClear={() => renderer?.clearSelection()}
              />
            ) : null}
            {scene ? <DisplayControls compact /> : null}
          </TabsContent>
          <TabsContent value="display">
            {scene ? <DisplayControls /> : null}
          </TabsContent>
          <FileDetails {...fileProps} />
        </div>
      </Tabs>
    </aside>
  );
}
