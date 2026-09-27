import type { BoardScene } from "../lib/board/model";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { BoardLayers } from "../lib/board/layers";

import type { DisplayOptions, LayerPriority } from "../lib/board/display";
import { Button } from "./ui/button";

export function DisplayOrderPanel({
  scene,
  display,
  setDisplay,
}: {
  scene: BoardScene;
  display: DisplayOptions;
  setDisplay: Dispatch<SetStateAction<DisplayOptions>>;
}) {
  const { t } = useTranslation();
  const groups = [
    {
      category: "etch",
      name: "Etch",
      layers: new BoardLayers(scene)
        .all()
        .filter(
          (l) =>
            !scene.specialLayers?.some(
              (s) => s.id === l.id && s.kind === "bond-wire",
            ),
        ),
    },
    {
      category: "bond-wire",
      name: "Profile",
      layers: scene.specialLayers?.filter((l) => l.kind === "bond-wire") ?? [],
    },
    { category: "via", name: "Via", layers: scene.layers },
    { category: "pin", name: "Pin", layers: scene.layers },
    { category: "text", name: t("order.drawing"), layers: scene.drawingLayers },
  ] as const;
  const key = (item: LayerPriority) => `${item.category}:${item.layer}`;
  const move = (index: number, delta: number) =>
    setDisplay((previous) => {
      const priorities = [...previous.priorities];
      const other = index + delta;
      if (other < 0 || other >= priorities.length) return previous;
      [priorities[index], priorities[other]] = [
        priorities[other],
        priorities[index],
      ];
      return { ...previous, priorities };
    });
  return (
    <section className="display-order" aria-label={t("order.label")}>
      <label className="order-label" htmlFor="active-layer">
        {t("order.active")}
      </label>
      <select
        id="active-layer"
        value={display.activeLayer ?? ""}
        onChange={(event) =>
          setDisplay((previous) => ({
            ...previous,
            activeLayer:
              event.target.value === "" ? null : Number(event.target.value),
          }))
        }
      >
        <option value="">{t("order.none")}</option>
        {scene.layers.map((layer) => (
          <option key={layer.id} value={layer.id}>
            {layer.name}
          </option>
        ))}
      </select>
      {display.activeLayer !== null && <p>{t("order.activeHint")}</p>}
      <details className="priority-details">
        <summary>
          {t("order.custom")} <span>{display.priorities.length}</span>
        </summary>
        <p>{t("order.customHint")}</p>
        <select
          aria-label={t("order.add")}
          value=""
          onChange={(event) => {
            const [category, layer] = event.target.value.split(":");
            if (!category) return;
            const item = { category, layer: Number(layer) } as LayerPriority;
            setDisplay((previous) =>
              previous.priorities.some((value) => key(value) === key(item))
                ? previous
                : { ...previous, priorities: [item, ...previous.priorities] },
            );
          }}
        >
          <option value="">{t("order.addLayer")}</option>
          {groups.map((group) => (
            <optgroup key={group.category} label={group.name}>
              {group.layers
                .filter(
                  (layer) =>
                    !display.priorities.some(
                      (item) =>
                        item.category === group.category &&
                        item.layer === layer.id,
                    ),
                )
                .map((layer) => (
                  <option
                    key={layer.id}
                    value={`${group.category}:${layer.id}`}
                  >
                    {layer.name} · {group.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <ol className="priority-list">
          {display.priorities.map((item, index) => {
            const group = groups.find(
              (group) => group.category === item.category,
            )!;
            const layer = group.layers.find((layer) => layer.id === item.layer);
            const name = `${layer?.name ?? item.layer} ${group.name}`;
            return (
              <li key={key(item)}>
                <i style={{ background: layer?.color }} />
                <span title={name}>
                  {layer?.name ?? item.layer}
                  <small>{group.name}</small>
                </span>
                <button
                  type="button"
                  aria-label={t("order.moveUp", { name })}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  aria-label={t("order.moveDown", { name })}
                  disabled={index === display.priorities.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  aria-label={t("order.remove", { name })}
                  onClick={() =>
                    setDisplay((previous) => ({
                      ...previous,
                      priorities: previous.priorities.filter(
                        (value) => key(value) !== key(item),
                      ),
                    }))
                  }
                >
                  <X size={13} />
                </button>
              </li>
            );
          })}
        </ol>
        <Button
          variant="ghost"
          disabled={display.activeLayer === null && !display.priorities.length}
          onClick={() =>
            setDisplay((previous) => ({
              ...previous,
              activeLayer: null,
              priorities: [],
            }))
          }
        >
          {t("order.reset")}
        </Button>
      </details>
    </section>
  );
}
