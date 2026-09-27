import type { BoardScene } from "../lib/board/model";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, Eye, EyeOff, Focus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BoardDisplay } from "../lib/board/display";
import { BoardLayers } from "../lib/board/layers";

import { type DisplayOptions, type LayerCategory } from "../lib/board/display";
import { Button } from "./ui/button";
const channels: { id: LayerCategory; name: string; descriptionKey: string }[] =
  [
    { id: "bond-wire", name: "Profile", descriptionKey: "layers.bondWireHint" },
    { id: "etch", name: "Etch", descriptionKey: "layers.etchHint" },
    { id: "via", name: "Via", descriptionKey: "layers.viaHint" },
    { id: "pin", name: "Pin", descriptionKey: "layers.pinHint" },
  ];
export function LayersPanel({
  scene,
  display,
  setDisplay,
}: {
  scene: BoardScene;
  display: DisplayOptions;
  setDisplay: Dispatch<SetStateAction<DisplayOptions>>;
}) {
  const { t } = useTranslation();
  const layers = new BoardLayers(scene).all();
  const [expanded, setExpanded] = useState<number | undefined>(layers[0]?.id);
  return (
    <div className="layer-list">
      <div className="layer-actions">
        <Button
          variant="ghost"
          onClick={() =>
            setDisplay({
              ...display,
              hidden: new Set(
                [...display.hidden].filter(
                  (id) => !layers.some((l) => l.id === id),
                ),
              ),
            })
          }
        >
          {t("layers.showAll")}
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            setDisplay({
              ...display,
              hidden: new Set([...display.hidden, ...layers.map((l) => l.id)]),
            })
          }
        >
          {t("layers.hideAll")}
        </Button>
      </div>
      {layers.map((layer) => (
        <div
          key={layer.id}
          className="layer-card"
          data-hidden={display.hidden.has(layer.id)}
          data-active={display.activeLayer === layer.id}
        >
          <div className="layer-row">
            <button
              type="button"
              className="layer-select"
              aria-label={t("layers.activate", { name: layer.name })}
              aria-pressed={display.activeLayer === layer.id}
              onClick={() => {
                setExpanded(layer.id);
                setDisplay((previous) => ({
                  ...previous,
                  activeLayer:
                    previous.activeLayer === layer.id ? null : layer.id,
                }));
              }}
            >
              <i style={{ background: layer.color }} aria-hidden="true" />
              <span title={layer.name}>{layer.name}</span>
              {layer.layerFunction ? (
                <small className="layer-function">
                  {t(`metadata.functions.${layer.layerFunction}`)}
                </small>
              ) : null}
            </button>
            <label
              className="layer-visibility"
              title={t("layers.visibility", { name: layer.name })}
            >
              <input
                type="checkbox"
                className="sr-only"
                aria-label={t("layers.visibility", { name: layer.name })}
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
              {display.hidden.has(layer.id) ? (
                <EyeOff size={16} aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
            </label>
            <button
              type="button"
              className="layer-expand"
              aria-label={t("layers.objects", { name: layer.name })}
              aria-expanded={expanded === layer.id}
              aria-controls={`layer-channels-${layer.id}`}
              onClick={() =>
                setExpanded(expanded === layer.id ? undefined : layer.id)
              }
            >
              <ChevronDown size={14} aria-hidden="true" />
            </button>
          </div>
          <div
            className="layer-channel-wrap"
            hidden={expanded !== layer.id}
            id={`layer-channels-${layer.id}`}
          >
            <Button
              variant="ghost"
              className="layer-solo"
              title={t("layers.only", { name: layer.name })}
              aria-label={t("layers.only", { name: layer.name })}
              onClick={() =>
                setDisplay((previous) => ({
                  ...previous,
                  hidden: new Set(
                    [...previous.hidden]
                      .filter((id) => !layers.some((l) => l.id === id))
                      .concat(
                        layers
                          .filter((l) => l.id !== layer.id)
                          .map((l) => l.id),
                      ),
                  ),
                }))
              }
            >
              <Focus aria-hidden="true" />
              <span>{t("layers.only", { name: layer.name })}</span>
            </Button>
            <div
              className="layer-channels"
              role="group"
              aria-label={t("layers.objects", { name: layer.name })}
            >
              {channels
                .filter((channel) => {
                  const special = scene.specialLayers?.find(
                    (l) => l.id === layer.id,
                  );
                  return special
                    ? channel.id === special.category
                    : channel.id !== "bond-wire";
                })
                .map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    aria-label={`${layer.name} ${channel.name}`}
                    title={t(channel.descriptionKey)}
                    aria-pressed={
                      display.layerVisibility.get(layer.id)?.[channel.id] !==
                      false
                    }
                    disabled={
                      display.hidden.has(layer.id) ||
                      (channel.id === "via" && !display.vias) ||
                      (channel.id === "pin" && !display.pins)
                    }
                    onClick={() =>
                      setDisplay((previous) =>
                        BoardDisplay.setLayerVisibility(
                          previous,
                          layer.id,
                          channel.id,
                          previous.layerVisibility.get(layer.id)?.[
                            channel.id
                          ] === false,
                        ),
                      )
                    }
                  >
                    {channel.name}
                  </button>
                ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
