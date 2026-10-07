"use client";

import { useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { pad } from "./hud";
import type { ArchiveEngine } from "./engine";
import type { Shelf } from "./shelf";
import type { ArchiveFile } from "./types";

/**
 * A photographer's own archive: their albums as cards on the stage (see
 * shelf.ts) in place of the photographer cards, so there is no moving on to
 * someone else's. Taps focus a card or open the focused one; ← →, swipes and
 * the wheel move along them. It draws nothing itself: the page's overview
 * has the panel.
 */
export default function ArchiveShelf({
  engine,
  files,
  indexes,
  selected,
  onSelect,
  onOpen
}: {
  /** Null until the scene is ready. */
  engine: ArchiveEngine | null;
  files: ArchiveFile[];
  /** The photographer's albums, as indexes into `files`. */
  indexes: number[];
  /** The selected album, as an index into `files`. */
  selected: number;
  onSelect: (fileIndex: number) => void;
  onOpen: (fileIndex: number) => void;
}) {
  const t = useTranslations("album3d");
  const shelf = useRef<Shelf | null>(null);
  const focus = Math.max(0, indexes.indexOf(selected));

  const move = useCallback(
    (direction: number) => {
      const next = indexes[Math.max(0, Math.min(indexes.length - 1, focus + direction))];
      if (next !== undefined) onSelect(next);
    },
    [indexes, focus, onSelect]
  );

  useEffect(() => {
    if (!engine) return;
    const cards = indexes.map((index, i) => {
      const album = files[index];
      const cover = album.prints[0];
      return {
        id: album.id,
        code: `AL-${pad(i + 1)}`,
        title: album.title,
        date: album.dateLabel || t("noDate"),
        meta: [t("photos", { count: album.photoCount }), album.location].filter(Boolean).join(" · "),
        thumb: cover?.thumb ?? "",
        med: cover?.med ?? ""
      };
    });
    void engine.showShelf().then((next) => {
      shelf.current = next;
      next?.setCards(cards);
      next?.setFocus(focus);
    });
  }, [engine, files, indexes, focus, t]);

  useEffect(() => {
    if (!engine) return;
    engine.setStageHandler((input) => {
      if (input.kind === "wheel") move(input.direction);
      else if (input.kind === "swipe") move(input.x || input.y * (shelf.current?.columns() ?? 1));
      else if (input.index === focus && !input.moved) onOpen(indexes[focus]);
      else move(input.index - focus);
    });
    return () => engine.setStageHandler(null);
  }, [engine, indexes, focus, move, onOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || (e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault();
      move(e.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [move]);

  return null;
}
