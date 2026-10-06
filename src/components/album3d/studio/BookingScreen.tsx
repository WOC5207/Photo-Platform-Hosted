"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { deleteSlot } from "@/app/[locale]/dashboard/(protected)/bookings/actions";
import BookingStatusButton from "@/components/admin/BookingStatusButton";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import CopyButton from "@/components/admin/CopyButton";
import SlotAdder from "@/components/admin/SlotAdder";
import { Hints, Rolling, pad } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, StepButtons, isInteractive, metaLabel, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { StudioHeading } from "./shared";
import type { StudioAccount, StudioSchedule } from "./types";

/**
 * One booking page's schedule, as the photographer runs it: the slots hang
 * as tabs in day columns on the board, lit for the seats still free, and the
 * panel shows the focused slot's bookings (cancel, restore, send the
 * visitor's link again), deletes the slot, and adds more to the day. Changes
 * go through the classic dashboard's actions.
 */
export default function BookingScreen({ account, schedule }: { account: StudioAccount; schedule: StudioSchedule }) {
  const t = useTranslations("album3d");
  const tb = useTranslations("adminBookings");
  const tc = useTranslations("common");
  const tp = useTranslations("preparation");
  const { path, key, touch } = useStage();
  const scene = useScene("board");
  const { username } = account;
  const days = schedule.days;
  const [day, setDay] = useState(() => Math.max(0, days.findIndex((d) => d.slots.length > 0)));
  const [row, setRow] = useState(0);

  const focusedDay = days[day];
  const at = Math.min(row, Math.max(0, (focusedDay?.slots.length ?? 1) - 1));
  const slot = focusedDay?.slots[at];

  // ------------------------------------------------------------- scene --
  const tiles = useMemo<BoardTile[]>(
    () =>
      days.flatMap((d, column) =>
        d.slots.map((s, r) => ({
          id: s.id,
          column,
          row: r,
          kicker: s.price,
          main: `${s.start}–${s.end}`,
          detail: [s.description],
          left: s.capacity - s.booked,
          total: s.capacity,
          status: tb("booked", { booked: s.booked, capacity: s.capacity })
        }))
      ),
    [days, tb]
  );
  const flat = useMemo(() => {
    let n = 0;
    for (let d = 0; d < day; d++) n += days[d].slots.length;
    return n + at;
  }, [days, day, at]);

  useEffect(() => {
    scene?.setTiles("slots", `studio-schedule:${schedule.id}`, tiles, days.map((d) => d.label), "");
  }, [scene, tiles, days, schedule.id]);
  useEffect(() => {
    scene?.setFocus(flat);
  }, [scene, flat]);

  // ---------------------------------------------------------- controls --
  const moveDay = (delta: number) => {
    if (days.length > 0) {
      setDay((d) => Math.max(0, Math.min(days.length - 1, d + delta)));
      setRow(0);
    }
  };
  const moveRow = (delta: number) => {
    const count = focusedDay?.slots.length ?? 0;
    if (count > 0) setRow((r) => Math.max(0, Math.min(count - 1, Math.min(r, count - 1) + delta)));
  };
  const showBookings = () => document.getElementById("studio-slot")?.focus();

  useScreenKeys((k, target) => {
    // A one-day schedule lays its slots across lanes: ←/→ step along them.
    const lanes = scene?.columns() ?? 1;
    if (k === "ArrowLeft" || k === "ArrowRight") {
      const delta = k === "ArrowLeft" ? -1 : 1;
      if (lanes > 1) moveRow(delta);
      else moveDay(delta);
    } else if (k === "ArrowUp") moveRow(-lanes);
    else if (k === "ArrowDown") moveRow(lanes);
    else if (k === "Enter" && slot && !isInteractive(target)) showBookings();
    else return false;
    return true;
  });

  useStageInput((input) => {
    if (input.kind === "pick") {
      const tile = tiles[input.index];
      if (!tile) return;
      if (input.index === flat) showBookings();
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

  const state = !schedule.bookingEnabled ? tb("offPublicly") : schedule.open ? tb("open") : tb("closed");
  const confirmed = slot?.bookings.filter((b) => b.status === "confirmed").length ?? 0;

  return (
    <>
      <BookingPanel expanded>
        <StudioHeading trail={t("studioBookings")} title={schedule.title}>
          <p className="font-meta mt-3 text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
            {[schedule.dates, schedule.location, state].filter(Boolean).join(" · ")}
          </p>
        </StudioHeading>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <Link href={path({ kind: "studio", username, page: "bookingDetails", id: schedule.id })} scroll={false} className={secondaryClass}>
            {t("studioBookingDetails")}
            <span aria-hidden="true" className="ml-auto">→</span>
          </Link>
          {schedule.lottery ? (
            <Link href={path({ kind: "studio", username, page: "lottery", id: schedule.id })} scroll={false} className={secondaryClass}>
              {tb("lotteryTool")}
              <span aria-hidden="true" className="ml-auto">→</span>
            </Link>
          ) : schedule.galleryId ? (
            <Link href={path({ kind: "studio", username, page: "event", id: schedule.galleryId })} scroll={false} className={secondaryClass}>
              {t("studioAlbum")}
              <span aria-hidden="true" className="ml-auto">→</span>
            </Link>
          ) : null}
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {(["slotSheet", "preparation"] as const).map((page) => (
            <Link
              key={page}
              href={`${path({ kind: "studio", username, page })}?event=${encodeURIComponent(schedule.id)}`}
              scroll={false}
              className={secondaryClass}
            >
              {page === "slotSheet" ? tp("slots") : tp("equipment")}
              <span aria-hidden="true" className="ml-auto">→</span>
            </Link>
          ))}
        </div>

        <div className="mt-4 border border-border-strong p-3">
          <p className={metaLabel}>{tb("shareLink")}</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs text-success">{schedule.shareUrl}</code>
            <CopyButton text={schedule.shareUrl} label={tc("copyLink")} copiedLabel={tc("copied")} />
          </div>
        </div>

        {days.length > 1 && (
          <div role="group" aria-label={tb("daysLabel")} className="mt-6 flex flex-wrap gap-1">
            {days.map((d, i) => (
              <button
                key={d.id}
                type="button"
                aria-pressed={i === day}
                onClick={() => {
                  setDay(i);
                  setRow(0);
                }}
                className={`font-meta inline-flex min-h-10 items-center px-3 text-[0.6875rem] uppercase tracking-[0.1em] transition ${
                  i === day ? "bg-fg text-page" : "border border-border-strong hover:border-fg"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        )}

        {slot ? (
          <section id="studio-slot" tabIndex={-1} aria-labelledby="studio-slot-title" className="mt-6 grid gap-3 outline-none">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="studio-slot-title" className="font-meta text-lg">
                {focusedDay.label} · {slot.start}–{slot.end}
              </h2>
              <div className="flex items-center gap-2">
                <p className={metaLabel}>
                  {t("studioSlot")}{" "}
                  <span className="text-fg">
                    <Rolling value={pad(at + 1)} />
                  </span>{" "}
                  / {pad(focusedDay.slots.length)}
                </p>
                {focusedDay.slots.length > 1 && <StepButtons onStep={moveRow} atStart={at === 0} atEnd={at >= focusedDay.slots.length - 1} />}
              </div>
            </div>
            <p className="text-sm text-fg-muted">
              {[tb("booked", { booked: slot.booked, capacity: slot.capacity }), slot.price && tb("pricePerPersonDisplay", { price: slot.price }), slot.description]
                .filter(Boolean)
                .join(" · ")}
            </p>
            {slot.bookings.length === 0 ? (
              <p className="text-sm text-fg-subtle">{t("studioNoBookings")}</p>
            ) : (
              <ul aria-label={t("studioSlotBookings", { count: confirmed })} className="grid gap-2">
                {slot.bookings.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-start justify-between gap-2 border border-border-strong bg-page/70 px-3 py-2 text-sm">
                    <div className={`min-w-0 flex-1 ${b.status === "cancelled" ? "text-fg-faint line-through" : ""}`}>
                      <p className="font-semibold">{b.subject ? `${b.name} · ${b.subject}` : b.name}</p>
                      {b.contact && <p className="text-xs text-fg-muted">{b.contact}</p>}
                      {b.notes && <p className="mt-0.5 whitespace-pre-line text-xs text-fg-subtle">{b.notes}</p>}
                      <p className="text-xs text-fg-subtle">
                        {tb("bookedAt")}: {b.bookedAt}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CopyButton text={b.manageUrl} label={tb("copyBookingLink", { name: b.name })} copiedLabel={tb("bookingLinkCopied")} />
                      <BookingStatusButton bookingId={b.id} status={b.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <form action={deleteSlot} className="justify-self-start">
              <input type="hidden" name="slotId" value={slot.id} />
              <ConfirmSubmit label={tb("deleteSlot")} confirmText={tb("confirmDeleteSlot")} />
            </form>
          </section>
        ) : (
          <p className="mt-6 text-sm text-fg-muted">{focusedDay ? tb("noSlotsThisDay") : t("studioNoDays")}</p>
        )}

        {focusedDay && (
          <details className="mt-6 border-t border-border pt-4" open={focusedDay.slots.length === 0}>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
              + {tb("addSlots")} · {focusedDay.label}
            </summary>
            <div className="mt-3">
              <SlotAdder
                key={focusedDay.id}
                bookingDayId={focusedDay.id}
                allowMultiDaySync={schedule.allowMultiDaySync}
                priceEnabled={schedule.priceEnabled}
              />
            </div>
          </details>
        )}
      </BookingPanel>
      {!touch && tiles.length > 0 && (
        <Hints
          className={styles.menuHint}
          parts={[`← → ↑ ↓ ${t("studioHintSlot")}`, `${key("confirm")} ${t("studioHintBookings")}`, `${key("back")} ${t("hintBack")}`]}
        />
      )}
    </>
  );
}
