import { useId } from "react";
import { useStore } from "zustand";
import { useTranslation } from "react-i18next";
import { viewerStore } from "../lib/viewer-store";
import { Switch } from "./ui/switch";

const objectControls = [
  ["vias", "display.viaPads"],
  ["pins", "display.componentPads"],
  ["drills", "display.drills"],
  ["backdrills", "display.backdrills"],
  ["filled", "display.filledPads"],
] as const;
const labelControls = [
  ["boardText", "display.boardText"],
  ["zoneNames", "display.zoneNames"],
  ["trackNames", "display.trackNames"],
  ["pinNames", "display.pinNames"],
  ["viaNames", "display.viaNames"],
  ["thruLabels", "display.thruLabels"],
  ["bbLabels", "display.bbLabels"],
] as const;

export function DisplayControls({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const scene = useStore(viewerStore, (state) => state.scene);
  const display = useStore(viewerStore, (state) => state.display);
  const setDisplay = viewerStore.getState().setDisplay;
  if (!scene) return null;
  const groups = compact
    ? [
        {
          label: "display.settings",
          controls: [objectControls[0], objectControls[1], labelControls[2]],
        },
      ]
    : [
        { label: "display.objects", controls: objectControls },
        { label: "display.labels", controls: labelControls },
      ];
  return (
    <section className="display-controls" aria-label={t("display.settings")}>
      {groups.map((group) => (
        <fieldset key={group.label}>
          <legend>{t(group.label)}</legend>
          {group.controls.map(([key, label]) => (
            <div className="display-toggle" key={key}>
              <label htmlFor={`${id}-${key}`}>{t(label)}</label>
              <Switch
                id={`${id}-${key}`}
                checked={display[key] !== false}
                onCheckedChange={(checked) =>
                  setDisplay((previous) => ({ ...previous, [key]: checked }))
                }
              />
            </div>
          ))}
        </fieldset>
      ))}
      <fieldset className="opacity-controls">
        <legend className="sr-only">{t("display.opacity")}</legend>
        {(
          [
            ["opacity", "display.globalOpacity"],
            ["shapes", "display.copperOpacity"],
          ] as const
        ).map(([key, label]) => (
          <label className="opacity-control" key={key}>
            <span>{t(label)}</span>
            <output>{Math.round(display[key] * 100)}%</output>
            <input
              type="range"
              aria-label={t(label)}
              min="0"
              max="1"
              step=".01"
              value={display[key]}
              onChange={(event) => {
                const value = Number(event.target.value);
                setDisplay((previous) => ({ ...previous, [key]: value }));
              }}
            />
          </label>
        ))}
      </fieldset>
      {!compact && scene.drawingLayers.length > 0 ? (
        <details className="drawing-layers">
          <summary>
            {t("display.drawingLayers")}{" "}
            <span>{scene.drawingLayers.length}</span>
          </summary>
          <p>{t("display.drawingHint")}</p>
          {scene.drawingLayers.map((layer) => (
            <label key={layer.id}>
              <input
                type="checkbox"
                checked={!display.hidden.has(layer.id)}
                onChange={() =>
                  setDisplay((previous) => {
                    const hidden = new Set(previous.hidden);
                    if (hidden.has(layer.id)) hidden.delete(layer.id);
                    else hidden.add(layer.id);
                    return { ...previous, hidden };
                  })
                }
              />
              <span>{layer.name}</span>
            </label>
          ))}
        </details>
      ) : null}
    </section>
  );
}
