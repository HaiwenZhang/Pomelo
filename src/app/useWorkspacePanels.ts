import { useEffect, useState } from "react";
import type { Renderer } from "../lib/render/renderer";

type Panel = "layers" | "inspector";

/** Floating panels share space on small screens while retaining independent desktop controls. */
export function useWorkspacePanels(renderer: Renderer | null) {
  const [panels, setPanels] = useState(() => ({
    layers: window.innerWidth > 700,
    inspector: window.innerWidth > 1100,
  }));

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1100px)");
    const collapse = () => {
      if (query.matches) setPanels({ layers: false, inspector: false });
    };
    query.addEventListener("change", collapse);
    return () => query.removeEventListener("change", collapse);
  }, []);

  useEffect(() => {
    if (!renderer) return;
    const updateInsets = () => {
      const narrow = window.innerWidth <= 1100;
      const panelWidth = window.innerWidth <= 1280 ? 252 : 280;
      renderer.setViewportInsets({
        left: !narrow && panels.layers ? panelWidth + 36 : 24,
        right: !narrow && panels.inspector ? panelWidth + 36 : 24,
        top: 82,
        bottom: 112,
      });
    };
    updateInsets();
    window.addEventListener("resize", updateInsets);
    return () => window.removeEventListener("resize", updateInsets);
  }, [renderer, panels]);

  function togglePanel(panel: Panel) {
    if (
      panels[panel] &&
      document
        .getElementById(`${panel}-panel`)
        ?.contains(document.activeElement)
    ) {
      document.getElementById(`toggle-${panel}`)?.focus();
    }
    setPanels((previous) => {
      const opening = !previous[panel];
      return window.innerWidth <= 1100 && opening
        ? { layers: panel === "layers", inspector: panel === "inspector" }
        : { ...previous, [panel]: opening };
    });
  }

  return { panels, togglePanel };
}
