"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/Button";
import { posterFieldClasses } from "@/components/sharing-posters/posterFieldClasses";
import {
  SHARING_POSTER_CREDIT_KINDS,
  SHARING_POSTER_CREDIT_LABEL_MAX,
  SHARING_POSTER_MAX_CREDIT_LINES,
  sharingPosterCreditLabel,
  type SharingPosterCreditKind,
  type SharingPosterCreditLine,
  type SharingPosterTitledKind
} from "@/lib/sharingPoster";

const KIND_NAMES = {
  cosplayer: "creditKindCosplayer",
  photographer: "creditKindPhotographer",
  equipment: "creditKindEquipment",
  event: "creditKindEvent",
  date: "creditKindDate",
  location: "creditKindLocation",
  custom: "creditKindCustom"
} as const satisfies Record<SharingPosterCreditKind, string>;

const KIND_HINTS: Partial<Record<SharingPosterCreditKind, "creditKindEquipmentHint" | "creditKindCustomHint">> = {
  equipment: "creditKindEquipmentHint",
  custom: "creditKindCustomHint"
};

type FocusTarget = { id: string; part: "handle" | "value" } | "add" | null;

const AUTO_SCROLL_STEP = 12;
const AUTO_SCROLL_EDGE = 40;

/** The element that scrolls `element` into view: the nearest scrolling ancestor, or the page. */
function scrollContainer(element: HTMLElement): HTMLElement {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const { overflowY } = getComputedStyle(parent);
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) return parent;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/**
 * How far to scroll while a layer is dragged at `pointerY`. On a phone the
 * pinned preview covers the top of the list and the tab bar its bottom, so
 * rather than fixed edge zones this asks what is actually drawn over the list:
 * it scrolls toward a covered end of the list while the pointer is over
 * whatever covers it, or within the screen's edge.
 */
function autoScrollDelta(list: HTMLElement, pointerY: number): number {
  const rect = list.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const covered = (y: number) => {
    if (y < 0 || y >= window.innerHeight) return true;
    const element = document.elementFromPoint(x, y);
    return !element || !list.contains(element);
  };
  const upward = pointerY < rect.top + rect.height / 2;
  const nearEdge = upward ? pointerY < AUTO_SCROLL_EDGE : pointerY > window.innerHeight - AUTO_SCROLL_EDGE;
  if (upward && covered(rect.top + 1) && (nearEdge || covered(pointerY))) return -AUTO_SCROLL_STEP;
  if (!upward && covered(rect.bottom - 1) && (nearEdge || covered(pointerY))) return AUTO_SCROLL_STEP;
  return 0;
}

/**
 * The credits as a stack of layers, one printed line each: the top layer is
 * the first line under the photographs. Layers are added from a menu, dragged
 * (or moved with the arrow keys) to reorder, and removed individually.
 */
export default function SharingPosterCreditLayers({
  lines,
  defaultLabels,
  cnWarning,
  onConfirmCn,
  onAdd,
  onMove,
  onValueChange,
  onLabelChange,
  onRemove
}: {
  lines: SharingPosterCreditLine[];
  defaultLabels: Record<SharingPosterTitledKind, string>;
  /** Shown under cosplayer lines while some photographs have no CN and the shared one is unchecked. */
  cnWarning: string | null;
  /** Accepts the shared CN as it stands. */
  onConfirmCn: () => void;
  /** Adds a line of this kind at the bottom and returns its id. */
  onAdd: (kind: SharingPosterCreditKind) => string;
  onMove: (id: string, index: number) => void;
  onValueChange: (id: string, value: string) => void;
  onLabelChange: (id: string, value: string | undefined) => void;
  onRemove: (id: string) => void;
}) {
  const t = useTranslations("sharingPosters");
  const helpId = useId();
  const menuId = useId();
  const listRef = useRef<HTMLOListElement>(null);
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const valueRefs = useRef(new Map<string, HTMLInputElement>());
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const menuWrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuItemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const endDragRef = useRef<(() => void) | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAbove, setMenuAbove] = useState(false);
  const [focusTarget, setFocusTarget] = useState<FocusTarget>(null);
  const [movedId, setMovedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const full = lines.length >= SHARING_POSTER_MAX_CREDIT_LINES;
  const kindName = (kind: SharingPosterCreditKind) => t(KIND_NAMES[kind]);

  // Focus follows the layer an action touched, once it has re-rendered.
  useEffect(() => {
    if (!focusTarget) return;
    if (focusTarget === "add") addButtonRef.current?.focus();
    else (focusTarget.part === "handle" ? handleRefs : valueRefs).current.get(focusTarget.id)?.focus();
    setFocusTarget(null);
  }, [focusTarget, lines]);

  useEffect(() => {
    if (!movedId || dragId) return;
    const index = lines.findIndex((line) => line.id === movedId);
    if (index >= 0) {
      setAnnouncement(t("creditLineMoved", { kind: t(KIND_NAMES[lines[index].kind]), position: index + 1, total: lines.length }));
    }
    setMovedId(null);
  }, [movedId, dragId, lines, t]);

  useEffect(() => () => endDragRef.current?.(), []);

  // Open upward when the menu would run off the bottom of the screen and
  // fits above the button; measured before paint, so it never flickers.
  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuAbove(false);
      return;
    }
    const menu = menuRef.current?.getBoundingClientRect();
    const button = addButtonRef.current?.getBoundingClientRect();
    if (menu && button && menu.bottom > window.innerHeight && button.top - menu.height > 0) setMenuAbove(true);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    menuItemRefs.current[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menuWrapRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  /**
   * Window listeners rather than pointer capture: reordering moves the row's
   * DOM node, and a moved node can lose its capture. The target position is
   * how many other rows sit above the pointer, so repeated events before a
   * re-render ask for the same move and cannot undo each other.
   */
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    endDragRef.current?.();
    setDragId(id);
    let pointerY = event.clientY;
    const reorder = () => {
      const rows = listRef.current?.querySelectorAll<HTMLElement>("[data-line-id]") ?? [];
      let index = 0;
      for (const row of Array.from(rows)) {
        if (row.dataset.lineId === id) continue;
        const rect = row.getBoundingClientRect();
        if (pointerY > rect.top + rect.height / 2) index += 1;
      }
      onMoveRef.current(id, index);
    };
    const move = (moveEvent: PointerEvent) => {
      pointerY = moveEvent.clientY;
      reorder();
    };
    // Scrolling moves the rows under a still pointer, so reorder after each step.
    let frame = 0;
    const step = () => {
      const list = listRef.current;
      const delta = list ? autoScrollDelta(list, pointerY) : 0;
      if (list && delta) {
        scrollContainer(list).scrollBy(0, delta);
        reorder();
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    const end = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      endDragRef.current = null;
      setDragId(null);
      setMovedId(id);
    };
    endDragRef.current = end;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function onHandleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, id: string, index: number) {
    const targets: Record<string, number> = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: lines.length - 1
    };
    const target = targets[event.key];
    if (target === undefined) return;
    event.preventDefault();
    if (target < 0 || target >= lines.length || target === index) return;
    onMove(id, target);
    setFocusTarget({ id, part: "handle" });
    setMovedId(id);
  }

  function remove(id: string, index: number) {
    const neighbour = lines[index + 1] ?? lines[index - 1];
    onRemove(id);
    setFocusTarget(neighbour ? { id: neighbour.id, part: "handle" } : "add");
  }

  function choose(kind: SharingPosterCreditKind) {
    setMenuOpen(false);
    setFocusTarget({ id: onAdd(kind), part: "value" });
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = menuItemRefs.current.filter((item): item is HTMLButtonElement => item !== null);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next: Record<string, number> = {
      ArrowDown: (current + 1) % items.length,
      ArrowUp: (current - 1 + items.length) % items.length,
      Home: 0,
      End: items.length - 1
    };
    if (event.key === "Escape") {
      event.preventDefault();
      setMenuOpen(false);
      addButtonRef.current?.focus();
    } else if (event.key === "Tab") {
      setMenuOpen(false);
    } else if (next[event.key] !== undefined) {
      event.preventDefault();
      items[next[event.key]]?.focus();
    }
  }

  return (
    <div className="grid gap-3">
      <p id={helpId} className="sr-only">{t("moveCreditLineHelp")}</p>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
      {lines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong p-4 text-sm text-fg-subtle">{t("creditLinesEmpty")}</p>
      ) : (
        // A container: the panel is a narrow column on desktop, so the title
        // and text sit side by side only when the list itself is wide enough.
        <ol ref={listRef} aria-label={t("creditLayersLabel")} className="@container grid gap-2">
          {lines.map((line, index) => {
            const name = kindName(line.kind);
            const defaultTitle = line.kind === "custom" ? "" : defaultLabels[line.kind];
            const title = line.kind === "custom" ? "" : sharingPosterCreditLabel(line.label, defaultTitle);
            const dragging = dragId === line.id;
            return (
              <li
                key={line.id}
                data-line-id={line.id}
                className={`grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-2 gap-y-1.5 rounded-lg border bg-raised p-2 transition-[border-color,box-shadow] ${
                  dragging ? "relative z-10 border-accent shadow-[0_18px_48px_rgb(0_0_0/0.16)]" : "border-border"
                }`}
              >
                <button
                  ref={(element) => {
                    if (element) handleRefs.current.set(line.id, element);
                    else handleRefs.current.delete(line.id);
                  }}
                  type="button"
                  aria-label={t("moveCreditLine", { kind: name })}
                  aria-describedby={helpId}
                  onPointerDown={(event) => startDrag(event, line.id)}
                  onKeyDown={(event) => onHandleKeyDown(event, line.id, index)}
                  className={`row-span-2 flex w-9 touch-none select-none items-center justify-center self-stretch rounded-md text-fg-subtle transition-colors hover:bg-surface hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                    dragging ? "cursor-grabbing bg-surface text-fg" : "cursor-grab"
                  }`}
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                    <circle cx="9" cy="6" r="1.6" />
                    <circle cx="15" cy="6" r="1.6" />
                    <circle cx="9" cy="12" r="1.6" />
                    <circle cx="15" cy="12" r="1.6" />
                    <circle cx="9" cy="18" r="1.6" />
                    <circle cx="15" cy="18" r="1.6" />
                  </svg>
                </button>
                <p className="flex min-h-9 min-w-0 items-center gap-2 text-sm font-semibold text-fg-muted">
                  <span className="font-meta text-xs text-fg-subtle">{String(index + 1).padStart(2, "0")}</span>
                  <span className="truncate">{name}</span>
                </p>
                <button
                  type="button"
                  aria-label={t("removeCreditLine", { kind: name })}
                  onClick={() => remove(line.id, index)}
                  className="flex h-9 w-9 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-danger-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                >
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                </button>
                <div
                  className={`col-span-2 col-start-2 grid gap-2 ${
                    line.kind === "custom" ? "" : "@lg:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]"
                  }`}
                >
                  {line.kind !== "custom" && (
                    <input
                      type="text"
                      value={line.label ?? defaultTitle}
                      placeholder={defaultTitle}
                      maxLength={SHARING_POSTER_CREDIT_LABEL_MAX}
                      aria-label={t("creditLineTitle", { kind: name })}
                      onChange={(event) => onLabelChange(line.id, event.target.value)}
                      // Blank, or the default typed back, returns to the output
                      // language's title so an untouched title keeps following it.
                      onBlur={() => onLabelChange(line.id, title === defaultTitle ? undefined : title)}
                      className={`${posterFieldClasses} font-semibold`}
                    />
                  )}
                  <input
                    ref={(element) => {
                      if (element) valueRefs.current.set(line.id, element);
                      else valueRefs.current.delete(line.id);
                    }}
                    type="text"
                    value={line.value}
                    maxLength={2000}
                    placeholder={t("creditLineEmpty")}
                    aria-label={line.kind === "custom" ? name : title}
                    onChange={(event) => onValueChange(line.id, event.target.value)}
                    className={posterFieldClasses}
                  />
                </div>
                {line.kind === "cosplayer" && cnWarning && (
                  <div role="alert" className="col-span-2 col-start-2 grid gap-2 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-fg-muted sm:flex sm:items-center sm:justify-between">
                    <p>{cnWarning}</p>
                    <button type="button" onClick={onConfirmCn} className={buttonClasses({ size: "compact", className: "shrink-0" })}>
                      {t("confirmCn")}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div ref={menuWrapRef} className="relative flex flex-wrap items-center gap-3">
        <button
          ref={addButtonRef}
          type="button"
          disabled={full}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={() => setMenuOpen((open) => !open)}
          className={buttonClasses({ size: "compact" })}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {t("addCreditLine")}
          <svg aria-hidden="true" viewBox="0 0 24 24" className={`h-4 w-4 transition ${menuOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {full && <p className="text-sm text-fg-subtle">{t("creditLinesFull", { max: SHARING_POSTER_MAX_CREDIT_LINES })}</p>}
        {menuOpen && (
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={t("addCreditLine")}
            onKeyDown={onMenuKeyDown}
            className={`absolute left-0 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border-strong bg-raised p-2 shadow-[0_18px_48px_rgb(0_0_0/0.16)] ${
              menuAbove ? "bottom-[calc(100%+0.5rem)]" : "top-[calc(100%+0.5rem)]"
            }`}
          >
            {SHARING_POSTER_CREDIT_KINDS.map((kind, index) => {
              const hint = KIND_HINTS[kind];
              return (
                <div key={kind}>
                  {kind === "custom" && <div role="separator" className="my-1 border-t border-border" />}
                  <button
                    ref={(element) => {
                      menuItemRefs.current[index] = element;
                    }}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    onClick={() => choose(kind)}
                    className="flex min-h-11 w-full flex-col items-start justify-center rounded-lg px-3 py-1.5 text-left text-sm font-medium text-fg-muted transition-colors hover:bg-accent-surface hover:text-fg focus-visible:bg-accent-surface focus-visible:text-fg focus-visible:outline-none"
                  >
                    {kindName(kind)}
                    {hint && <span className="text-xs font-normal text-fg-subtle">{t(hint)}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
