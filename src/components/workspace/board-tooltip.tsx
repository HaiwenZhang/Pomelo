import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { Point } from "../../lib/board/model";
import type { HoverTooltip, Renderer } from "../../lib/render/renderer";

const noTooltip = () => null;
const noSubscription = () => () => {};

export function placeTooltip(
  point: Point,
  box: { width: number; height: number },
  viewport: { width: number; height: number },
) {
  const margin = 8;
  let left = point[0] + 16;
  let top = point[1] + 20;
  if (left + box.width > viewport.width - margin)
    left = point[0] - box.width - 16;
  if (top + box.height > viewport.height - margin)
    top = point[1] - box.height - 16;
  return {
    left: Math.max(margin, Math.min(left, viewport.width - box.width - margin)),
    top: Math.max(margin, Math.min(top, viewport.height - box.height - margin)),
  };
}

export function BoardTooltip({ renderer }: { renderer: Renderer | null }) {
  const tooltip = useSyncExternalStore(
    renderer?.subscribeTooltip ?? noSubscription,
    renderer?.getTooltip ?? noTooltip,
    noTooltip,
  );
  return tooltip ? <TooltipCard tooltip={tooltip} /> : null;
}

export function TooltipCard({ tooltip }: { tooltip: HoverTooltip }) {
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = card.current;
    const viewport = element?.parentElement;
    if (!element || !viewport) return;
    const position = placeTooltip(
      tooltip.point,
      { width: element.offsetWidth, height: element.offsetHeight },
      { width: viewport.clientWidth, height: viewport.clientHeight },
    );
    element.style.left = `${position.left}px`;
    element.style.top = `${position.top}px`;
  }, [tooltip]);
  return (
    <div ref={card} className="board-tooltip" role="tooltip">
      {tooltip.lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>
  );
}
