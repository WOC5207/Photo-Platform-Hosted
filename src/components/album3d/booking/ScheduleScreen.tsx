"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createBooking3d, type BookingFormState } from "@/app/[locale]/(public)/book/actions";
import { Hints, pad } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import type { BookingSchedule, ScheduleSlot } from "./types";
import {
  BookingPanel,
  LocalTimeNote,
  NotFoundPanel,
  fieldClass,
  isInteractive,
  metaLabel,
  primaryClass,
  secondaryClass,
  useScene,
  useScreenKeys,
  useStage,
  useStageInput
} from "./shared";

/** Bookings one request can make, as on the classic page. */
const CART_LIMIT = 20;

/**
 * One booking event's schedule board. Days are columns of time-slot tabs in
 * the scene; Enter (or a tap on the focused tab) moves a tab into the amber
 * loadout tray, and the review step collects the visitor's details in the
 * panel. Booking goes through the classic page's checks, limits and emails
 * (createBooking3d); booked tabs are stamped and filed.
 */
export default function ScheduleScreen({ schedule }: { schedule: BookingSchedule | null }) {
  const [round, setRound] = useState(0);
  if (!schedule) return <NotFoundPanel />;
  return <Schedule key={`${schedule.token}:${round}`} schedule={schedule} onAgain={() => setRound((n) => n + 1)} />;
}

type Step = "slots" | "review";

function Schedule({ schedule, onAgain }: { schedule: BookingSchedule; onAgain: () => void }) {
  const t = useTranslations("album3d");
  const tb = useTranslations("booking");
  const { go, path, key, touch } = useStage();
  const scene = useScene("board");
  const [state, formAction, pending] = useActionState<BookingFormState, FormData>(createBooking3d, {});
  const days = schedule.days;
  const [day, setDay] = useState(() => Math.max(0, days.findIndex((d) => d.slots.some((s) => s.remaining > 0))));
  const [row, setRow] = useState(0);
  const [cart, setCart] = useState<string[]>([]);
  const [step, setStep] = useState<Step>("slots");
  const [subjects, setSubjects] = useState<Record<string, string>>({});
  const [details, setDetails] = useState({ name: "", contactValue: "", email: "", notes: "" });
  const booked = state.bookings && state.bookings.length > 0 ? state.bookings : null;
  const bookable = schedule.open && days.some((d) => d.slots.some((s) => s.remaining > 0));

  const slotById = useMemo(
    () => new Map(days.flatMap((d) => d.slots.map((slot) => [slot.id, { slot, day: d }] as const))),
    [days]
  );
  const focusedDay = days[day];
  const focused: ScheduleSlot | undefined = focusedDay?.slots[Math.min(row, (focusedDay?.slots.length ?? 1) - 1)];

  // ------------------------------------------------------------- scene --
  const tiles = useMemo<BoardTile[]>(
    () =>
      days.flatMap((d, column) =>
        d.slots.map((slot, r) => ({
          id: slot.id,
          column,
          row: r,
          kicker: slot.price ? tb("pricePerPersonDisplay", { price: slot.price }) : d.label,
          main: `${slot.start}–${slot.end}`,
          detail: [slot.description],
          left: slot.remaining,
          total: slot.capacity,
          status: slot.remaining > 0 ? tb("slotsLeft", { count: slot.remaining }) : tb("full")
        }))
      ),
    [days, tb]
  );
  const flat = useMemo(() => {
    let n = 0;
    for (let d = 0; d < day; d++) n += days[d].slots.length;
    return n + Math.min(row, Math.max(0, (focusedDay?.slots.length ?? 1) - 1));
  }, [days, day, row, focusedDay]);

  const trayLabel = t("trayLabel", { count: pad(cart.length), max: CART_LIMIT });
  useEffect(() => {
    scene?.setTiles("slots", `schedule:${schedule.token}`, tiles, days.map((d) => d.label), trayLabel);
  }, [scene, tiles, days, schedule.token, trayLabel]);
  useEffect(() => {
    scene?.setFocus(flat);
  }, [scene, flat]);
  useEffect(() => {
    scene?.setCart(cart);
  }, [scene, cart]);
  // A new round starts with a clean board.
  useEffect(() => {
    scene?.clearStamps();
  }, [scene]);
  useEffect(() => {
    if (!scene || !booked) return;
    scene.stamp(
      booked.map((b) => b.slotId),
      booked.map((_, i) => t("stampLabel", { number: pad(i + 1) }))
    );
  }, [scene, booked, t]);

  // ---------------------------------------------------------- controls --
  const toggle = (slot: ScheduleSlot | undefined) => {
    if (!slot || pending || booked || !schedule.open) return;
    setCart((current) =>
      current.includes(slot.id)
        ? current.filter((id) => id !== slot.id)
        : slot.remaining > 0 && current.length < CART_LIMIT
          ? [...current, slot.id]
          : current
    );
  };
  const remove = (id: string) => {
    setCart((current) => current.filter((x) => x !== id));
    setSubjects((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };
  const moveDay = (delta: number) => {
    if (days.length > 0) setDay((d) => Math.max(0, Math.min(days.length - 1, d + delta)));
  };
  const moveRow = (delta: number) => {
    const count = focusedDay?.slots.length ?? 0;
    if (count > 0) setRow((r) => Math.max(0, Math.min(count - 1, Math.min(r, count - 1) + delta)));
  };
  const review = () => {
    if (cart.length === 0 || booked) return;
    setStep("review");
    requestAnimationFrame(() => document.getElementById("album3d-review")?.focus());
  };

  useScreenKeys((k, target) => {
    if (booked) return false;
    if (step === "review") {
      if (k !== "Escape" && k !== "Backspace") return false;
      setStep("slots");
      return true;
    }
    if (k === "ArrowLeft") moveDay(-1);
    else if (k === "ArrowRight") moveDay(1);
    else if (k === "ArrowUp") moveRow(-1);
    else if (k === "ArrowDown") moveRow(1);
    else if (k === "/") review();
    else if (k === "Enter" && !isInteractive(target)) toggle(focused);
    else return false;
    return true;
  });

  useStageInput((input) => {
    if (step !== "slots" || booked) return;
    if (input.kind === "pick") {
      const tile = tiles[input.index];
      if (!tile) return;
      if (input.index === flat) toggle(slotById.get(tile.id)?.slot);
      else {
        setDay(tile.column);
        setRow(tile.row);
      }
    } else if (input.kind === "wheel") moveRow(input.direction);
    else if (input.x !== 0) moveDay(input.x);
    else moveRow(input.y);
  });

  const errorMessage = state.error
    ? {
        validation: tb("errorValidation"),
        slotFull: tb("errorSlotFull"),
        slotUnavailable: tb("errorSlotUnavailable"),
        rateLimited: tb("errorRateLimited"),
        closed: tb("errorClosed")
      }[state.error]
    : null;
  const when = (id: string) => {
    const hit = slotById.get(id);
    return hit ? `${hit.day.label} · ${hit.slot.start}–${hit.slot.end}` : "";
  };

  // ------------------------------------------------------------ render --
  return (
    <>
      <BookingPanel expanded={step === "review" || Boolean(booked)}>
        <p className={metaLabel}>
          @{schedule.username} <span aria-hidden="true" className="mx-2">／</span> {t("crumbSchedule")}
        </p>
        <h1 className="mt-3 text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] [overflow-wrap:anywhere] wide:text-[3.25rem]">
          {schedule.title}
        </h1>
        <p className="font-meta mt-3 text-[0.6875rem] uppercase tracking-[0.12em] text-fg-subtle">
          {[schedule.dates, schedule.location].filter(Boolean).join(" · ")}
        </p>
        <div aria-hidden="true" className={styles.calloutRule} />

        {booked ? (
          <section aria-labelledby="album3d-booked" className="mt-6">
            <p className={metaLabel}>{t("bookedKicker")}</p>
            <h2 id="album3d-booked" role="status" className="mt-2 text-2xl font-bold tracking-[-0.02em]">
              {tb("batchConfirmedTitle")}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{tb("batchConfirmedHint", { count: booked.length })}</p>
            <ol className="mt-5 grid gap-2">
              {booked.map((booking, i) => (
                <li key={booking.cancelToken} className="flex flex-wrap items-center justify-between gap-3 border border-border-strong bg-page/70 px-4 py-3">
                  <span>
                    <span className="font-meta mr-3 text-[0.6875rem] text-accent-text">{t("stampLabel", { number: pad(i + 1) })}</span>
                    <span className="text-sm font-semibold">{when(booking.slotId) || tb("bookingNumber", { number: i + 1 })}</span>
                  </span>
                  <Link href={`/my-booking/${booking.cancelToken}?new=1`} className="inline-flex min-h-10 items-center gap-2 text-sm underline-offset-4 hover:underline">
                    {tb("manageBooking")} <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-fg-muted">{tb("saveBatchLinksNotice")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" onClick={onAgain} className={secondaryClass}>
                {t("bookAgain")}
              </button>
              {schedule.drawToken && (
                <button
                  type="button"
                  onClick={() => go({ kind: "draw", username: schedule.username, token: schedule.drawToken as string })}
                  className={secondaryClass}
                >
                  {t("crumbDraw")} <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </section>
        ) : !schedule.open ? (
          <p className="mt-6 text-sm text-fg-muted">{tb("closedNotice")}</p>
        ) : !bookable && cart.length === 0 ? (
          <p className="mt-6 text-sm text-fg-muted">{tb("noSlotsNotice")}</p>
        ) : (
          <form action={formAction} className="mt-5">
            <input type="hidden" name="eventToken" value={schedule.token} />
            {cart.map((id) => (
              <input key={id} type="hidden" name="slotIds" value={id} />
            ))}

            {step === "slots" ? (
              <>
                {days.length > 1 && (
                  <div role="group" aria-label={tb("chooseDay")} className="flex flex-wrap gap-1">
                    {days.map((d, i) => {
                      const inCart = d.slots.filter((s) => cart.includes(s.id)).length;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          aria-pressed={i === day}
                          onClick={() => {
                            setDay(i);
                            setRow(0);
                          }}
                          className={`font-meta inline-flex min-h-10 items-center gap-2 px-3 text-[0.6875rem] uppercase tracking-[0.1em] transition ${
                            i === day ? "bg-fg text-page" : "border border-border-strong hover:border-fg"
                          }`}
                        >
                          {d.label}
                          {inCart > 0 && <span className="bg-accent px-1 text-[0.625rem] text-page">{inCart}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                <ol aria-label={focusedDay?.label ?? tb("chooseSlots")} className={`${styles.roster} mt-3 grid gap-1`}>
                  {(focusedDay?.slots ?? []).map((slot, r) => {
                    const active = r === Math.min(row, focusedDay.slots.length - 1);
                    const inCart = cart.includes(slot.id);
                    const full = slot.remaining <= 0;
                    return (
                      <li key={slot.id} onMouseEnter={() => setRow(r)} className="relative">
                        <span aria-hidden="true" className={`absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 bg-fg ${active ? "opacity-100" : "opacity-0"}`} />
                        <button
                          type="button"
                          aria-pressed={inCart}
                          aria-current={active ? "true" : undefined}
                          disabled={full && !inCart}
                          onFocus={() => setRow(r)}
                          onClick={() => {
                            setRow(r);
                            toggle(slot);
                          }}
                          className={`flex min-h-12 w-full items-center gap-4 py-1.5 pr-3 text-left transition-[background-color,padding] disabled:opacity-40 ${
                            active ? "bg-fg/[0.06] pl-6" : "pl-4"
                          }`}
                        >
                          <span className="font-meta w-28 shrink-0 text-sm">{slot.start}–{slot.end}</span>
                          <span className="min-w-0 flex-1">
                            {slot.description && <span className="block truncate text-xs text-fg-muted">{slot.description}</span>}
                            <span className={`font-meta block text-[0.625rem] uppercase tracking-[0.12em] ${full ? "text-fg-subtle" : "text-success"}`}>
                              {full ? tb("full") : tb("slotsLeft", { count: slot.remaining })}
                              {slot.price && <span className="ml-2 text-fg-subtle">{slot.price}</span>}
                            </span>
                          </span>
                          <span
                            aria-hidden="true"
                            className={`font-meta shrink-0 text-[0.625rem] uppercase tracking-[0.12em] ${inCart ? "bg-accent px-1.5 py-0.5 text-page" : "text-fg-subtle"}`}
                          >
                            {inCart ? t("inTray") : full ? "" : "+"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ol>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border-strong pt-4">
                  <p className="text-sm">
                    <span className="font-semibold">{tb("cartCount", { count: cart.length })}</span>
                    <span className="block text-xs text-fg-muted">
                      {cart.length >= CART_LIMIT ? tb("cartLimitReached", { count: CART_LIMIT }) : touch ? t("scheduleTouchHint") : t("scheduleHint")}
                    </span>
                  </p>
                  <button type="button" disabled={cart.length === 0} onClick={review} className={primaryClass}>
                    {tb("reviewCart", { count: cart.length })}
                    {!touch && <kbd className="font-meta border border-page/40 px-1 text-[0.625rem] font-normal">{key("alt")}</kbd>}
                  </button>
                </div>
              </>
            ) : (
              <section id="album3d-review" tabIndex={-1} aria-labelledby="album3d-review-title" className="outline-none">
                <div className="flex items-center justify-between gap-3">
                  <h2 id="album3d-review-title" className="text-xl font-bold tracking-[-0.02em]">{tb("reviewTitle")}</h2>
                  <button type="button" onClick={() => setStep("slots")} className="text-sm underline underline-offset-4">
                    {tb("addMoreSlots")}
                  </button>
                </div>
                <p className="mt-1 text-xs text-fg-muted">{tb("subjectPerSlotHint", { term: schedule.subjectTerm })}</p>
                <ol className="mt-4 grid gap-2">
                  {cart.map((id) => (
                    <li key={id} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border bg-page/70 p-3 ${state.failedSlotId === id ? "border-danger" : "border-border-strong"}`}>
                      <span className="font-meta text-sm">{when(id)}</span>
                      <button type="button" disabled={pending} onClick={() => remove(id)} className="text-xs text-danger underline underline-offset-4 disabled:opacity-50">
                        {tb("remove")}
                      </button>
                      {state.failedSlotId === id && <span className="col-span-2 text-xs font-semibold text-danger">{tb("slotNeedsAttention")}</span>}
                      <input
                        name="subjects"
                        maxLength={200}
                        placeholder={tb("subjectForSlot", { term: schedule.subjectTerm })}
                        aria-label={tb("subjectForSlotA11y", { term: schedule.subjectTerm, date: slotById.get(id)?.day.label ?? "", time: when(id) })}
                        value={subjects[id] ?? ""}
                        onChange={(e) => setSubjects((current) => ({ ...current, [id]: e.target.value }))}
                        className={`${fieldClass} col-span-2`}
                      />
                    </li>
                  ))}
                </ol>
                <fieldset className="mt-5 grid gap-3">
                  <legend className={`${metaLabel} mb-2`}>{tb("yourDetails")}</legend>
                  {(
                    [
                      ["name", tb("name"), "name", "text", true],
                      ["contactValue", tb("contactValue"), "off", "text", true],
                      ["email", tb("email"), "email", "email", false]
                    ] as const
                  ).map(([name, label, autoComplete, type, required]) => (
                    <label key={name} className="grid gap-1 text-sm">
                      <span className="text-fg-muted">
                        {label}
                        {required && " *"}
                      </span>
                      <input
                        name={name}
                        type={type}
                        required={required}
                        maxLength={200}
                        autoComplete={autoComplete}
                        value={details[name]}
                        onChange={(e) => setDetails((current) => ({ ...current, [name]: e.target.value }))}
                        className={fieldClass}
                      />
                      {name === "contactValue" && <span className="text-xs text-fg-subtle">{tb("contactHint")}</span>}
                    </label>
                  ))}
                  <label className="grid gap-1 text-sm">
                    <span className="text-fg-muted">{tb("notes")}</span>
                    <textarea
                      name="notes"
                      rows={2}
                      maxLength={2000}
                      placeholder={tb("notesPlaceholder")}
                      value={details.notes}
                      onChange={(e) => setDetails((current) => ({ ...current, notes: e.target.value }))}
                      className={fieldClass}
                    />
                  </label>
                </fieldset>
                {errorMessage && (
                  <p role="alert" className="mt-4 border-l-2 border-danger bg-danger-surface px-3 py-2 text-sm text-danger">
                    {errorMessage}
                  </p>
                )}
                <div className="mt-5 flex flex-wrap-reverse items-center justify-between gap-3">
                  <button type="button" disabled={pending} onClick={() => setStep("slots")} className={secondaryClass}>
                    <span aria-hidden="true">←</span> {tb("backToSlots")}
                  </button>
                  <button type="submit" disabled={pending || cart.length === 0} className={primaryClass}>
                    {pending ? tb("bookingInProgress") : tb("confirmBookings", { count: cart.length })}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </section>
            )}
          </form>
        )}

        {!booked && (
          <>
            <LocalTimeNote />
            <p className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-fg-muted">
              <Link href={`/book/${schedule.token}/check`} className="underline-offset-4 hover:text-fg hover:underline">
                {tb("alreadyBooked")} {tb("checkBookingButton")} ↗
              </Link>
              {schedule.drawToken && (
                <Link
                  href={path({ kind: "draw", username: schedule.username, token: schedule.drawToken })}
                  scroll={false}
                  className="underline-offset-4 hover:text-fg hover:underline"
                >
                  {t("crumbDraw")} →
                </Link>
              )}
            </p>
          </>
        )}
        <p aria-live="polite" className="sr-only">
          {focused && step === "slots" && !booked ? `${focusedDay.label} ${focused.start}–${focused.end}, ${focused.remaining > 0 ? tb("slotsLeft", { count: focused.remaining }) : tb("full")}` : ""}
        </p>
      </BookingPanel>
      {!touch && !booked && step === "slots" && bookable && (
        <Hints
          className={styles.menuHint}
          parts={[
            `${key("sides")} ${t("hintDay")}`,
            `${key("move")} ${t("hintTime")}`,
            `${key("confirm")} ${t("hintToggle")}`,
            `${key("alt")} ${t("hintReview")}`,
            `${key("back")} ${t("hintBack")}`
          ]}
        />
      )}
    </>
  );
}
