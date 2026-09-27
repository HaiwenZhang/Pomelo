import { PanelLeft, PanelRight } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BrdTextEncoding } from "../lib/allegro/binary/text-decoder";
import { Button } from "../components/ui/button";
import { FileBar } from "../components/workspace/file-bar";
import { LayersSidebar } from "../components/workspace/layers-sidebar";
import { InspectorSidebar } from "../components/workspace/inspector-sidebar";
import { ViewToolbar } from "../components/workspace/view-toolbar";
import { BoardTooltip } from "../components/workspace/board-tooltip";
import { WorkspaceFeedback } from "../components/workspace/workspace-feedback";
import { WorkspaceStatus } from "../components/workspace/workspace-status";
import { useBoardSurface } from "./useBoardSurface";
import { useWorkspacePanels } from "./useWorkspacePanels";

export function App() {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [encoding, setEncoding] = useState<BrdTextEncoding>("utf-8");
  const { canvas, renderer, sourceFile, openFile } = useBoardSurface(encoding);
  const { panels, togglePanel } = useWorkspacePanels(renderer);
  const chooseFile = () => input.current?.click();
  return (
    <div
      className="workspace"
      data-layers-open={panels.layers}
      data-inspector-open={panels.inspector}
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void openFile(event.dataTransfer.files[0]);
      }}
    >
      <a className="skip-link" href="#board-canvas">
        {t("workspace.skipCanvas")}
      </a>
      <main className="viewport" aria-label={t("workspace.title")}>
        <canvas
          id="board-canvas"
          ref={canvas}
          tabIndex={0}
          aria-label={t("workspace.canvas")}
        />
        <BoardTooltip renderer={renderer} />
        <WorkspaceFeedback dragging={dragging} onOpen={chooseFile} />
      </main>
      <FileBar onOpen={chooseFile} />
      <LayersSidebar
        open={panels.layers}
        onToggle={() => togglePanel("layers")}
        renderer={renderer}
      />
      <InspectorSidebar
        open={panels.inspector}
        onToggle={() => togglePanel("inspector")}
        renderer={renderer}
        encoding={encoding}
        onEncodingChange={setEncoding}
        sourceFile={sourceFile}
        onReload={() => void openFile(sourceFile.current ?? undefined)}
      />
      {!panels.layers ? (
        <Button
          variant="surface"
          className="panel-rail panel-rail-left"
          aria-label={t("workspace.expandLayers")}
          aria-expanded={false}
          aria-controls="layers-panel"
          onClick={() => togglePanel("layers")}
        >
          <PanelLeft aria-hidden="true" />
        </Button>
      ) : null}
      {!panels.inspector ? (
        <Button
          variant="surface"
          className="panel-rail panel-rail-right"
          aria-label={t("workspace.expandInspector")}
          aria-expanded={false}
          aria-controls="inspector-panel"
          onClick={() => togglePanel("inspector")}
        >
          <PanelRight aria-hidden="true" />
        </Button>
      ) : null}
      <ViewToolbar renderer={renderer} />
      <WorkspaceStatus renderer={renderer} />
      <input
        ref={input}
        type="file"
        accept=".brd,.mcm,.tgz,.tar.gz,.tar,.def,.pcb,.kicad_pcb,.pcbdoc"
        hidden
        onChange={(event) => {
          void openFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
