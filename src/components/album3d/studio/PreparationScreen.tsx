"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createChecklist3d } from "@/app/[locale]/3d/u/[username]/studio/actions";
import { GameMenu, Hints, Rolling, pad, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, fieldClass, isInteractive, metaLabel, primaryClass, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { StudioHeading } from "./shared";
import type { StudioPreparation } from "./types";

/**
 * Event preparation: the photographer's packing checklists as cards on the
 * board, soonest shoot first, each lit for the equipment not yet back. Event
 * days get their checklists by themselves; a separate list can be started
 * here. The booked-slot sheet is one step away.
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
  const lists = preparation.checklists;
  const at = Math.min(focus, Math.max(0, lists.length - 1));
  const here = path({ kind: "studio", username, page: "preparation" });
  const sheet = path({ kind: "studio", username, page: "slotSheet" });
  const query = preparation.event ? `?event=${encodeURIComponent(preparation.event)}` : "";

  const open = (index: number) => {
    const list = lists[index];
    if (list) go({ kind: "studio", username, page: "checklist", id: list.id });
  };

  const tiles = useMemo<BoardTile[]>(
    () =>
      lists.map((list, i) => ({
        id: list.id,
        column: 0,
        row: i,
        kicker: list.date || te("noShootDate"),
        main: list.name,
        // An event day's list is named after its event; the title shows once.
        detail: [list.eventTitle && list.eventTitle !== list.name ? list.eventTitle : "", te("itemCount", { count: list.items })].filter(Boolean),
        // Lamps for the equipment still to come home; a finished list is dimmed.
        left: list.gear - list.returned - list.broken,
        total: Math.min(16, list.gear),
        status: list.gear ? t("studioBack", { done: list.returned + list.broken, total: list.gear }) : te("itemCount", { count: list.items })
      })),
    [lists, t, te]
  );
  useEffect(() => {
    scene?.setTiles("events", `studio-checklists:${username}:${preparation.event ?? ""}`, tiles, [], "");
  }, [scene, tiles, username, preparation.event]);
  useEffect(() => {
    scene?.setFocus(at);
  }, [scene, at]);

  const move = (delta: number) => lists.length && setFocus(wrap(at + delta, lists.length));
  useScreenKeys((k, target) => {
    if (k === "ArrowUp" || k === "ArrowLeft") move(-1);
    else if (k === "ArrowDown" || k === "ArrowRight") move(1);
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
    else move(input.y !== 0 ? input.y * across : input.x);
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
            <GameMenu
              label={te("checklistsTitle")}
              className="mt-3"
              focus={at}
              onFocus={setFocus}
              items={lists.map((list, i) => ({
                key: list.id,
                label: list.name,
                sub: [list.date || te("noShootDate"), tiles[i]?.status].join(" · "),
                run: () => open(i)
              }))}
            />
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
      </BookingPanel>
      {!touch && lists.length > 0 && (
        <Hints className={styles.menuHint} parts={[`${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
