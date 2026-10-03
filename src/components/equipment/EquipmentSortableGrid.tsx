"use client";

import { Children, type DragEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import { reorderEquipment } from "@/app/[locale]/dashboard/(protected)/equipment/actions";

type Labels = {
  drag: string;
  moveEarlier: string;
  moveLater: string;
  saving: string;
  saved: string;
  error: string;
};

function moveItem(order: string[], sourceId: string, targetId: string): string[] {
  const source = order.indexOf(sourceId);
  const target = order.indexOf(targetId);
  if (source < 0 || target < 0 || source === target) return order;
  const next = [...order];
  next.splice(source, 1);
  next.splice(target, 0, sourceId);
  return next;
}

export default function EquipmentSortableGrid({
  itemIds,
  allItemIds,
  highlightedId,
  labels,
  reorderEnabled = true,
  children
}: {
  itemIds: string[];
  allItemIds: string[];
  highlightedId?: string;
  labels: Labels;
  reorderEnabled?: boolean;
  children: ReactNode;
}) {
  const initialChildren = Children.toArray(children);
  const childrenById = useMemo(
    () => new Map(itemIds.map((id, index) => [id, initialChildren[index]])),
    [initialChildren, itemIds]
  );
  const [order, setOrder] = useState(itemIds);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const orderMatchesItems =
    order.length === itemIds.length && order.every((id) => childrenById.has(id));
  const visibleOrder = orderMatchesItems ? order : itemIds;

  // App Router category/filter navigation preserves this client component.
  // Reconcile its local ordering state with the newly filtered server result;
  // otherwise stale IDs render as empty contact-sheet tiles.
  useEffect(() => {
    setOrder((current) =>
      current.length === itemIds.length &&
      current.every((id, index) => id === itemIds[index])
        ? current
        : itemIds
    );
    setDraggedId(null);
    setOverId(null);
    setStatus("idle");
  }, [itemIds]);

  async function persist(nextVisible: string[], previous: string[]) {
    setOrder(nextVisible);
    setStatus("saving");
    const visible = new Set(itemIds);
    let index = 0;
    const completeOrder = allItemIds.map((id) =>
      visible.has(id) ? nextVisible[index++] : id
    );
    const result = await reorderEquipment(completeOrder);
    if ("error" in result) {
      setOrder(previous);
      setStatus("error");
      return;
    }
    setStatus("saved");
  }

  function shift(id: string, delta: number) {
    if (status === "saving") return;
    const from = visibleOrder.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= visibleOrder.length) return;
    const next = [...visibleOrder];
    [next[from], next[to]] = [next[to], next[from]];
    void persist(next, visibleOrder);
  }

  function drop(event: DragEvent<HTMLElement>, targetId: string) {
    event.preventDefault();
    if (!draggedId || status === "saving") return;
    const previous = visibleOrder;
    const next = moveItem(visibleOrder, draggedId, targetId);
    setDraggedId(null);
    setOverId(null);
    if (next !== previous) void persist(next, previous);
  }

  return (
    <>
      {reorderEnabled && <div aria-live="polite" className="min-h-5 text-right text-xs font-semibold text-fg-subtle">
        {status === "saving" ? labels.saving : status === "saved" ? labels.saved : status === "error" ? labels.error : ""}
      </div>}
      <ul data-equipment-grid className="min-w-0 columns-1 gap-4 md:columns-2">
        {visibleOrder.map((id, index) => (
          <li
            key={id}
            id={`equipment-${id}`}
            onDragOver={(event) => {
              if (!reorderEnabled) return;
              if (!draggedId || status === "saving") return;
              event.preventDefault();
              setOverId(id);
            }}
            onDrop={(event) => reorderEnabled && drop(event, id)}
            className={`ui-panel mb-4 w-full min-w-0 break-inside-avoid overflow-hidden p-5 transition-[border-color,opacity,transform] ${
              highlightedId === id ? "ring-2 ring-success" : ""
            } ${overId === id && draggedId !== id ? "border-accent -translate-y-0.5" : ""} ${
              draggedId === id ? "opacity-60" : ""
            }`}
          >
            {reorderEnabled && <div className="mb-4 flex min-h-10 items-center justify-between gap-2 border-b border-border pb-3">
              <button
                type="button"
                draggable={status !== "saving"}
                onDragStart={(event) => {
                  setDraggedId(id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", id);
                }}
                onDragEnd={() => {
                  setDraggedId(null);
                  setOverId(null);
                }}
                disabled={status === "saving"}
                className="inline-flex min-h-10 cursor-grab items-center gap-2 rounded-lg px-2 text-xs font-semibold text-fg-subtle hover:bg-control hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 active:cursor-grabbing disabled:cursor-wait disabled:opacity-50 max-sm:min-h-11"
                aria-label={labels.drag}
                title={labels.drag}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor"><circle cx="8" cy="7" r="1.3"/><circle cx="16" cy="7" r="1.3"/><circle cx="8" cy="12" r="1.3"/><circle cx="16" cy="12" r="1.3"/><circle cx="8" cy="17" r="1.3"/><circle cx="16" cy="17" r="1.3"/></svg>
                <span>{labels.drag}</span>
              </button>
              <div className="flex gap-1">
                <button type="button" disabled={index === 0 || status === "saving"} onClick={() => shift(id, -1)} className="inline-flex size-10 items-center justify-center rounded-lg text-fg-subtle hover:bg-control hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:opacity-30 max-sm:size-11" aria-label={labels.moveEarlier} title={labels.moveEarlier}><svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 14 5-5 5 5"/></svg></button>
                <button type="button" disabled={index === visibleOrder.length - 1 || status === "saving"} onClick={() => shift(id, 1)} className="inline-flex size-10 items-center justify-center rounded-lg text-fg-subtle hover:bg-control hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 disabled:opacity-30 max-sm:size-11" aria-label={labels.moveLater} title={labels.moveLater}><svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 10 5 5 5-5"/></svg></button>
              </div>
            </div>}
            {childrenById.get(id)}
          </li>
        ))}
      </ul>
    </>
  );
}
