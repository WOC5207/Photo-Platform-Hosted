"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { finishSlot } from "@/app/[locale]/dashboard/(protected)/preparation/actions";
import { Hints, Rolling, pad } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, LocalTimeNote, StepButtons, fieldClass, isInteractive, metaLabel, primaryClass, secondaryClass, stepLanes, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { StudioHeading } from "./shared";
import type { StudioSheetSlot, StudioSlotSheet } from "./types";

type Filter = "all" | "pending" | "finished";

/**
 * Booked slots (confirmed bookings only) as tabs in day columns on the
 * board, lit until the shoot is marked finished. The panel shows the focused
 * slot's people and contacts, and marks it finished or undoes that; neither
 * touches the bookings or the seats.
 */
export default function SlotSheetScreen({ sheet }: { sheet: StudioSlotSheet }) {
  const t = useTranslations("album3d");
  const tp = useTranslations("preparation");
  const router = useRouter();
  const { path, key, touch } = useStage();
  const scene = useScene("board");
  const { username } = sheet.account;
  const [filter, setFilter] = useState<Filter>("all");
  const [day, setDay] = useState(0);
  const [row, setRow] = useState(0);
  const here = path({ kind: "studio", username, page: "slotSheet" });

  const days = useMemo(() => {
    const byDay = new Map<string, { label: string; slots: StudioSheetSlot[] }>();
    for (const slot of sheet.slots) {
      if (filter === "pending" && slot.finished) continue;
      if (filter === "finished" && !slot.finished) continue;
      const entry = byDay.get(slot.dayKey) ?? { label: slot.day, slots: [] };
      entry.slots.push(slot);
      byDay.set(slot.dayKey, entry);
    }
    return [...byDay.values()];
  }, [sheet.slots, filter]);
  // Open on the first day with a slot still to finish.
  useEffect(() => {
    const first = days.findIndex((d) => d.slots.some((s) => !s.finished));
    setDay(Math.max(0, first));
    setRow(0);
    // Only when the filter or the event changes, not on every mark.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sheet.event]);

  const d = Math.min(day, Math.max(0, days.length - 1));
  const focusedDay = days[d];
  const at = Math.min(row, Math.max(0, (focusedDay?.slots.length ?? 1) - 1));
  const slot = focusedDay?.slots[at] ?? null;

  const tiles = useMemo<BoardTile[]>(
    () =>
      days.flatMap((dd, column) =>
        dd.slots.map((s, r) => ({
          id: s.id,
          column,
          row: r,
          kicker: s.eventTitle,
          main: `${s.start}–${s.end}`,
          detail: [s.bookings.map((b) => b.name).join(", ")],
          left: s.finished ? 0 : 1,
          total: 1,
          status: s.finished ? tp("finished") : tp("pending")
        }))
      ),
    [days, tp]
  );
  const flat = useMemo(() => {
    let n = 0;
    for (let i = 0; i < d; i++) n += days[i].slots.length;
    return n + at;
  }, [days, d, at]);
  useEffect(() => {
    scene?.setTiles("slots", `studio-sheet:${username}:${sheet.event ?? ""}:${filter}`, tiles, days.map((dd) => dd.label), "");
  }, [scene, tiles, days, username, sheet.event, filter]);
  useEffect(() => {
    scene?.setFocus(flat);
  }, [scene, flat]);

  const moveDay = (delta: number) => {
    if (!days.length) return;
    setDay(Math.max(0, Math.min(days.length - 1, d + delta)));
    setRow(0);
  };
  const moveRow = (delta: number) => {
    const count = focusedDay?.slots.length ?? 0;
    if (count) setRow(Math.max(0, Math.min(count - 1, at + delta)));
  };
  const lengths = days.map((dd) => dd.slots.length);
  const stepSlot = (delta: number) => {
    const next = stepLanes(lengths, d, at, delta);
    if (!next) return;
    setDay(next[0]);
    setRow(next[1]);
  };
  const showSlot = () => document.getElementById("studio-sheet-slot")?.focus();

  useScreenKeys((k, target) => {
    const lanes = scene?.columns() ?? 1;
    if (k === "ArrowLeft" || k === "ArrowRight") {
      const delta = k === "ArrowLeft" ? -1 : 1;
      if (lanes > 1) moveRow(delta);
      else moveDay(delta);
    } else if (k === "ArrowUp") moveRow(-lanes);
    else if (k === "ArrowDown") moveRow(lanes);
    else if (k === "Enter" && slot && !isInteractive(target)) showSlot();
    else return false;
    return true;
  });
  useStageInput((input) => {
    if (input.kind === "pick") {
      const tile = tiles[input.index];
      if (!tile) return;
      if (input.index === flat) showSlot();
      else {
        setDay(tile.column);
        setRow(tile.row);
      }
    } else if (input.kind === "wheel") moveRow(input.direction);
    else {
      const lanes = scene?.columns() ?? 1;
      if (input.x === 0) moveRow(input.y * lanes);
      else if (lanes > 1) moveRow(input.x);
      else moveDay(input.x);
    }
  });

  const total = days.reduce((n, dd) => n + dd.slots.length, 0);

  return (
    <>
      <BookingPanel expanded>
        <StudioHeading trail={t("studioPreparation")} title={tp("slots")} />
        <p className="mt-4 text-sm text-fg-muted">{tp("slotsHint")}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {sheet.events.length > 0 && (
            <label className="grid gap-1 text-xs font-semibold text-fg-muted">
              {tp("event")}
              <select
                value={sheet.event ?? ""}
                onChange={(e) => router.push(e.target.value ? `${here}?event=${encodeURIComponent(e.target.value)}` : here, { scroll: false })}
                className={fieldClass}
              >
                <option value="">{tp("allEvents")}</option>
                {sheet.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs font-semibold text-fg-muted">
            {tp("status")}
            <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} className={fieldClass}>
              <option value="all">{tp("allStatuses")}</option>
              <option value="pending">{tp("pending")}</option>
              <option value="finished">{tp("finished")}</option>
            </select>
          </label>
        </div>
        <p className="font-meta mt-3 text-[0.6875rem] uppercase tracking-[0.12em] text-fg-subtle">
          {tp("slotCount", { count: total })}
          {sheet.more && ` · ${t("studioSheetMore")}`}
        </p>
        <LocalTimeNote />

        {slot ? (
          <section id="studio-sheet-slot" tabIndex={-1} aria-labelledby="studio-sheet-slot-title" className="mt-6 grid gap-3 outline-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="studio-sheet-slot-title" className="font-meta text-lg">
                {slot.day} · {slot.start}–{slot.end}
              </h2>
              <div className="flex items-center gap-2">
                <p className={metaLabel}>
                  {t("studioSlot")}{" "}
                  <span className="text-fg">
                    <Rolling value={pad(at + 1)} />
                  </span>{" "}
                  / {pad(focusedDay.slots.length)}
                </p>
                {tiles.length > 1 && <StepButtons onStep={stepSlot} atStart={flat === 0} atEnd={flat >= tiles.length - 1} />}
              </div>
            </div>
            <div>
              <Link href={path({ kind: "studio", username, page: "booking", id: slot.bookingEventId })} scroll={false} className="font-semibold underline-offset-4 hover:underline">
                {slot.eventTitle}
              </Link>
              <p className="text-sm text-fg-muted">
                {[slot.location && `${tp("location")}: ${slot.location}`, tp("bookedCount", { count: slot.booked, capacity: slot.capacity }), slot.price && `${tp("price")}: ${slot.price}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {slot.description && <p className="mt-1 whitespace-pre-wrap text-sm text-fg-muted">{slot.description}</p>}
            </div>
            <ul className="grid gap-2">
              {slot.bookings.map((b) => (
                <li key={b.id} className="border border-border-strong bg-page/70 px-3 py-2 text-sm">
                  <p className="font-semibold">{b.subject ? `${b.name} · ${b.subject}` : b.name}</p>
                  {b.contact && (
                    <p className="text-xs text-fg-muted">
                      {tp("contact")}: {b.contact}
                    </p>
                  )}
                  {b.email && (
                    <p className="text-xs text-fg-muted">
                      {tp("email")}: {b.email}
                    </p>
                  )}
                  {b.notes && <p className="mt-0.5 whitespace-pre-wrap text-xs text-fg-subtle">{b.notes}</p>}
                </li>
              ))}
            </ul>
            <form action={finishSlot}>
              <input type="hidden" name="id" value={slot.id} />
              <input type="hidden" name="finished" value={String(!slot.finished)} />
              <button type="submit" className={slot.finished ? secondaryClass : `${primaryClass} w-full`}>
                {slot.finished ? tp("undoFinished") : tp("markFinished")}
                {!slot.finished && <span aria-hidden="true" className="text-lg">✓</span>}
              </button>
            </form>
          </section>
        ) : (
          <div className="mt-6 grid gap-2">
            <p className="font-semibold">{tp("emptySlots")}</p>
            <p className="text-sm text-fg-muted">{tp("emptySlotsHint")}</p>
          </div>
        )}
      </BookingPanel>
      {!touch && tiles.length > 0 && (
        <Hints className={styles.menuHint} parts={[`← → ↑ ↓ ${t("studioHintSlot")}`, `${key("confirm")} ${t("studioHintBookings")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
