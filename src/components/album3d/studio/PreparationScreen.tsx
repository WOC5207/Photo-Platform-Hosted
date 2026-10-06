"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createChecklist3d } from "@/app/[locale]/3d/u/[username]/studio/actions";
import { GameMenu, Hints, Rolling, pad, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, fieldClass, isInteractive, metaLabel, primaryClass, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { ClassicLink, StudioHeading } from "./shared";
import type { StudioChecklistSummary, StudioPreparation } from "./types";

/**
 * Event preparation: the photographer's packing checklists grouped by their
 * event, each event a column on the board headed by its name with one card
 * per day, soonest first, lit for the equipment not yet back. Lists made on
 * their own sit together at the end. Event days get their checklists by
 * themselves; a separate list can be started here. The booked-slot sheet is
 * one step away.
 */
export default function PreparationScreen({ preparation }: { preparation: StudioPreparation }) {
  const t = useTranslations("album3d");
  const te = useTranslations("equipment");
  const tp = useTranslations("preparation");
  const router = useRouter();
  const { go, path, key, touch } = useStage();
  const scene = useScene("board");
  const [focus, setFocus] = useState(0);
  const { username } = preparation.account;
  // One group per event in order of its first day, then the separate lists;
  // `lists` runs through them in that order, so an index is the same on the
  // board, in the panel and for the keys.
  const groups = useMemo(() => {
    const byEvent = new Map<string, { key: string; title: string; lists: StudioChecklistSummary[] }>();
    const other: StudioChecklistSummary[] = [];
    for (const list of preparation.checklists) {
      if (!list.eventId) other.push(list);
      else if (byEvent.has(list.eventId)) byEvent.get(list.eventId)!.lists.push(list);
      else byEvent.set(list.eventId, { key: list.eventId, title: list.eventTitle, lists: [list] });
    }
    const all = [...byEvent.values()];
    if (other.length) all.push({ key: "", title: t("studioOtherLists"), lists: other });
    let start = 0;
    return all.map((group) => {
      const at = start;
      start += group.lists.length;
      return { ...group, start: at };
    });
  }, [preparation.checklists, t]);
  const lists = useMemo(() => groups.flatMap((group) => group.lists), [groups]);
  const at = Math.min(focus, Math.max(0, lists.length - 1));
  const here = path({ kind: "studio", username, page: "preparation" });
  const sheet = path({ kind: "studio", username, page: "slotSheet" });
  const query = preparation.event ? `?event=${encodeURIComponent(preparation.event)}` : "";

  const open = (index: number) => {
    const list = lists[index];
    if (list) go({ kind: "studio", username, page: "checklist", id: list.id });
  };

  // An event day's card leads with its date, as the event heads the column;
  // a separate list keeps its own name.
  const dayLabel = (list: StudioChecklistSummary) => (list.eventId ? list.date || te("noShootDate") : list.name);
  const dayNote = (list: StudioChecklistSummary) => (list.eventId ? "" : list.date || te("noShootDate"));
  const status = (list: StudioChecklistSummary) =>
    list.gear ? t("studioBack", { done: list.returned + list.broken, total: list.gear }) : te("itemCount", { count: list.items });

  const tiles = useMemo<BoardTile[]>(
    () =>
      groups.flatMap((group, column) =>
        group.lists.map((list, row) => ({
          id: list.id,
          column,
          row,
          kicker: dayNote(list),
          main: dayLabel(list),
          detail: list.gear ? [te("itemCount", { count: list.items })] : [],
          // Lamps for the equipment still to come home; a finished list is dimmed.
          left: list.gear - list.returned - list.broken,
          total: Math.min(16, list.gear),
          status: status(list)
        }))
      ),
    // dayLabel, dayNote and status follow t and te.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, t, te]
  );
  const headers = useMemo(() => groups.map((group) => group.title), [groups]);
  useEffect(() => {
    scene?.setTiles("slots", `studio-checklists:${username}:${preparation.event ?? ""}`, tiles, headers, "");
  }, [scene, tiles, headers, username, preparation.event]);
  useEffect(() => {
    scene?.setFocus(at);
  }, [scene, at]);

  const move = (delta: number) => lists.length && setFocus(wrap(at + delta, lists.length));
  // ← → step from event to event, landing on its first day.
  const groupAt = groups.findLastIndex((group) => group.start <= at);
  const moveGroup = (delta: number) => groups.length && setFocus(groups[wrap(groupAt + delta, groups.length)].start);
  useScreenKeys((k, target) => {
    if (k === "ArrowUp") move(-1);
    else if (k === "ArrowDown") move(1);
    else if (k === "ArrowLeft") moveGroup(-1);
    else if (k === "ArrowRight") moveGroup(1);
    else if (k === "Enter" && !isInteractive(target)) open(at);
    else return false;
    return true;
  });
  useStageInput((input) => {
    const across = scene?.columns() ?? 1;
    if (input.kind === "pick") {
      if (input.index === at) open(input.index);
      else setFocus(input.index);
    } else if (input.kind === "wheel") move(input.direction);
    else if (input.x !== 0) moveGroup(input.x);
    else move(input.y * across);
  });

  return (
    <>
      <BookingPanel>
        <StudioHeading trail={t("studioPreparation")} title={te("checklistsTitle")} />
        <p className="mt-4 text-sm text-fg-muted">{te("checklistsHint")}</p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Link href={`${sheet}${query}`} scroll={false} className={secondaryClass}>
            {tp("slots")}
            <span aria-hidden="true" className="ml-auto">→</span>
          </Link>
          <Link href={path({ kind: "studio", username, page: "equipment" })} scroll={false} className={secondaryClass}>
            {t("studioEquipment")}
            <span aria-hidden="true" className="ml-auto">→</span>
          </Link>
        </div>
        {preparation.events.length > 0 && (
          <label className="mt-4 grid gap-1 text-sm font-semibold text-fg-muted">
            {tp("event")}
            <select
              value={preparation.event ?? ""}
              onChange={(e) => router.push(e.target.value ? `${here}?event=${encodeURIComponent(e.target.value)}` : here, { scroll: false })}
              className={fieldClass}
            >
              <option value="">{tp("allEvents")}</option>
              {preparation.events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {lists.length === 0 ? (
          <p className="mt-6 text-sm text-fg-muted">{te("emptyChecklists")}</p>
        ) : (
          <>
            <p className={`${metaLabel} mt-6`}>
              {t("studioChecklist")}{" "}
              <span className="text-fg">
                <Rolling value={pad(at + 1)} />
              </span>{" "}
              / {pad(lists.length)}
            </p>
            {groups.map((group) => (
              <section key={group.key} aria-label={group.title} className="mt-4">
                <h2 className="font-meta border-b border-border pb-1.5 text-[0.6875rem] uppercase tracking-[0.12em] text-fg-muted">
                  {group.title} <span className="text-fg-subtle">· {group.lists.length}</span>
                </h2>
                <GameMenu
                  label={group.title}
                  className="mt-1"
                  focus={at - group.start}
                  onFocus={(i) => setFocus(group.start + i)}
                  items={group.lists.map((list, i) => ({
                    key: list.id,
                    label: dayLabel(list),
                    sub: [dayNote(list), status(list)].filter(Boolean).join(" · "),
                    run: () => open(group.start + i)
                  }))}
                />
              </section>
            ))}
          </>
        )}

        {!preparation.event && (
          <details className="mt-6 border-t border-border pt-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">+ {tp("standalone")}</summary>
            <form action={createChecklist3d} className="mt-3 grid gap-3">
              <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                {te("checklistName")}
                <input name="name" required maxLength={160} className={fieldClass} />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                {te("shootDate")}
                <input name="shootDate" type="date" className={fieldClass} />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                {te("notes")}
                <textarea name="notes" rows={2} maxLength={1000} className={fieldClass} />
              </label>
              <button type="submit" className={primaryClass}>
                {te("createChecklistButton")}
                <span aria-hidden="true" className="text-lg">+</span>
              </button>
            </form>
          </details>
        )}
        <ClassicLink href={`/dashboard/preparation/equipment${query}`} />
      </BookingPanel>
      {!touch && lists.length > 0 && (
        <Hints className={styles.menuHint} parts={[`${key("move")} ${t("hintSelect")}`, `${key("sides")} ${t("studioHintEvent")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
