import type { BoardScene } from "../lib/board/model";

import { MousePointer2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BoardLayers } from "../lib/board/layers";
import { ZoneShape } from "../lib/board/shapes/zone";

import { viewerI18n } from "../i18n";
import { localizeError, localizePhase } from "../i18n/messages";
import type {
  PickFilter,
  Selection,
  SelectionMode,
} from "../lib/interaction/picking";
import type { SelectionTaskState } from "../lib/render/renderer";
import { Button } from "./ui/button";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group";

const kinds = {
  drawing: "inspector.drawing",
  "bond-wire": "inspector.bondWire",
  segment: "inspector.segment",
  via: "inspector.via",
  finger: "inspector.finger",
  pin: "inspector.pin",
  zone: "inspector.zone",
} as const;
const modes: { value: SelectionMode; nameKey: string }[] = [
  { value: "object", nameKey: "inspector.object" },
  { value: "track", nameKey: "inspector.track" },
  { value: "net", nameKey: "inspector.net" },
  { value: "component", nameKey: "inspector.component" },
];
const mm = (value: number) => `${Number(value.toFixed(5))} mm`;
export function ObjectInspector({
  scene,
  selection,
  filter,
  mode,
  onFilter,
  onMode,
  onClear,
  task,
}: {
  scene: BoardScene;
  selection: Selection | null;
  filter: PickFilter;
  mode: SelectionMode;
  onFilter: (value: PickFilter) => void;
  onMode: (value: SelectionMode) => void;
  onClear: () => void;
  task?: SelectionTaskState | null;
}) {
  const { t } = useTranslation();
  const object = selection?.anchor.object;
  const layerName = (id: number) => new BoardLayers(scene).name(id);
  const properties: [string, string][] = [];
  if (object) {
    const value = object.value;
    properties.push(
      [t("inspector.property.hitLayer"), layerName(selection!.anchor.layer)],
      [
        t("inspector.property.objectId"),
        `0x${value.id.toString(16).toUpperCase()}`,
      ],
    );
    if (object.kind !== "drawing")
      properties.unshift([
        t("inspector.property.net"),
        scene.nets.get(value.net) || t("inspector.unassigned"),
      ]);
    if (object.kind === "drawing") {
      properties.push(
        [
          t("inspector.property.owner"),
          object.value.ownerId === undefined
            ? t("inspector.boardDrawing")
            : t("inspector.symbol", { id: object.value.ownerId }),
        ],
        [
          t("inspector.property.graphics"),
          String(object.value.graphicIds.length),
        ],
        [
          t("inspector.property.segments"),
          String(object.value.segments.length),
        ],
      );
      if (object.value.texts.length)
        properties.push([
          t("inspector.property.text"),
          object.value.texts.map((t) => t.text).join(" / "),
        ]);
    } else if (object.kind === "segment" || object.kind === "bond-wire") {
      const s = object.value;
      properties.push(
        [t("inspector.property.width"), mm(s.width)],
        [t("inspector.property.start"), `${mm(s.a[0])}, ${mm(s.a[1])}`],
        [t("inspector.property.end"), `${mm(s.b[0])}, ${mm(s.b[1])}`],
        [
          s.bondWire
            ? t("inspector.property.projectedLength")
            : t("inspector.property.length"),
          mm(
            s.arc
              ? Math.abs(s.arc.sweep) * s.arc.radius
              : Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]),
          ),
        ],
      );
      if (s.bondWire)
        properties.push(
          ["Profile", s.bondWire.profile],
          [
            t("inspector.property.material"),
            s.bondWire.material ?? t("inspector.unspecified"),
          ],
          [
            t("inspector.property.diePin"),
            `${s.bondWire.reference}.${s.bondWire.pinName}`,
          ],
          [
            t("inspector.property.bondWireId"),
            `0x${s.trackId.toString(16).toUpperCase()}`,
          ],
        );
      if (s.arc)
        properties.push([t("inspector.property.arcRadius"), mm(s.arc.radius)]);
    } else if (
      object.kind === "via" ||
      object.kind === "finger" ||
      object.kind === "pin"
    ) {
      const p = object.value;
      properties.push([
        t("inspector.property.position"),
        `${mm(p.at[0])}, ${mm(p.at[1])}`,
      ]);
      if (p.drillShape && p.drillShape.width !== p.drillShape.height)
        properties.push([
          t("inspector.property.slot"),
          `${mm(p.drillShape.width)} × ${mm(p.drillShape.height)}`,
        ]);
      else if (p.drill > 0)
        properties.push([t("inspector.property.drill"), mm(p.drill)]);
      if (p.drillShape && p.drillShape.width > 0)
        properties.push([
          t("inspector.property.plating"),
          p.drillShape.plated
            ? t("inspector.property.plated")
            : t("inspector.property.unplated"),
        ]);
      if (object.kind === "via") {
        properties.push(
          [
            t("inspector.property.span"),
            `${layerName(object.value.startLayer)} → ${layerName(object.value.endLayer)}`,
          ],
          [
            t("inspector.property.layerNumbers"),
            `${object.value.startLayer + 1}:${object.value.endLayer + 1}`,
          ],
        );
        const bd = object.value.backdrill;
        if (bd)
          properties.push(
            [
              t("inspector.property.backdrill"),
              bd.spans
                .map(
                  (span) =>
                    `${layerName(span.startLayer)} → ${layerName(span.stopLayer)}`,
                )
                .join("；"),
            ],
            [
              t("inspector.property.protectedLayer"),
              bd.spans.map((span) => layerName(span.protectedLayer)).join("；"),
            ],
            [t("inspector.property.backdrillDiameter"), mm(bd.displayDiameter)],
            [t("inspector.property.rotation"), `${bd.rotationDegrees}°`],
            [
              t("inspector.property.mirrored"),
              bd.mirrored ? t("inspector.yes") : t("inspector.no"),
            ],
          );
      } else if (object.kind === "finger")
        properties.push(
          [
            t("inspector.property.component"),
            object.value.finger?.reference ?? "",
          ],
          [t("inspector.property.pin"), object.value.finger?.name ?? ""],
          [
            "Padstack",
            object.value.padstackName ?? String(object.value.padstack),
          ],
          [
            t("inspector.property.rotation"),
            `${Number((((object.value.angle ?? 0) * 180) / Math.PI).toFixed(3))}°`,
          ],
        );
      else
        properties.push(
          [t("inspector.property.component"), object.value.reference],
          [t("inspector.property.pin"), object.value.name],
          [
            t("inspector.property.rotation"),
            `${Number((((((object.value.angle * 180) / Math.PI) % 360) + 360) % 360).toFixed(3))}°`,
          ],
        );
      if (object.kind === "pin" && object.value.die)
        properties.push(
          [t("inspector.property.type"), t("inspector.property.diePad")],
          ["Padstack", object.value.die.padstackName],
        );
    } else
      properties.push([
        t("inspector.property.holes"),
        String(Math.max(0, new ZoneShape(object.value).ringCount() - 1)),
      ]);
  }
  return (
    <section className="object-inspector" aria-label={t("inspector.label")}>
      <label className="order-label" htmlFor="pick-filter">
        {t("inspector.pick")}
      </label>
      <select
        id="pick-filter"
        value={filter}
        onChange={(event) => onFilter(event.target.value as PickFilter)}
      >
        <option value="all">{t("inspector.all")}</option>
        {Object.entries(kinds).map(([value, nameKey]) => (
          <option key={value} value={value}>
            {t(nameKey)}
          </option>
        ))}
      </select>
      <ToggleGroup
        type="single"
        value={mode}
        onValueChange={(value) => {
          const selected = modes.find((item) => item.value === value);
          if (selected) onMode(selected.value);
        }}
        className="selection-modes"
        aria-label={t("inspector.range")}
      >
        {modes.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value}>
            {t(item.nameKey)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {task && (
        <div className="selection-count" role={task.error ? "alert" : "status"}>
          <p>
            {task.error
              ? localizeError(task.error, viewerI18n)
              : localizePhase(task.phase, viewerI18n)}
          </p>
          <Button variant="ghost" onClick={onClear}>
            {t(task.error ? "inspector.close" : "inspector.cancelSelection")}
          </Button>
        </div>
      )}
      {object ? (
        <>
          <div className="selection-heading">
            <span>
              <MousePointer2 size={15} />
              <strong data-testid="selection-kind">
                {selection?.mode === "net" && object.kind !== "drawing"
                  ? scene.nets.get(object.value.net) ||
                    t("inspector.unassigned")
                  : t(kinds[object.kind])}
              </strong>
            </span>
            <Button
              variant="ghost"
              aria-label={t("inspector.clear")}
              onClick={onClear}
            >
              <X size={15} />
            </Button>
          </div>
          <p className="selection-count" data-testid="selection-count">
            {t("inspector.count", {
              count: selection!.objects.length.toLocaleString(),
            })}
            {selection!.mode !== "object" ? t("inspector.includesHidden") : ""}
          </p>
          <dl>
            {properties.map(([name, value]) => (
              <div key={name}>
                <dt>{name}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <div className="selection-empty">
          <MousePointer2 size={22} />
          <p>
            {t("inspector.empty")}
            <br />
            {t("inspector.emptyDetail")}
          </p>
        </div>
      )}
      <p className="selection-help">{t("inspector.help")}</p>
    </section>
  );
}
