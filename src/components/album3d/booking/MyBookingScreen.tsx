"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cancelMyBooking, spinMyBooking } from "@/app/[locale]/(public)/book/actions";
import { updateMyBooking, type EditBookingState } from "@/app/[locale]/(public)/my-booking/[cancelToken]/actions";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Hints, pad } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import type { DeckCard } from "../deck";
import type { MyBooking } from "./types";
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

/**
 * A visitor's own booking, the 3D twin of /my-booking/[token]. The booking
 * hangs alone on the booking board as a ticket stamped with its status; the
 * panel shows what the classic page does (the just-booked and cancelled
 * notices, the details, the edit window and form, the prize draw and the
 * cancel button) through the classic page's own actions. The prize draw
 * swaps the ticket for the deck of prizes, as the 3D prize draw does.
 */
export default function MyBookingScreen({ booking, isNew }: { booking: MyBooking | null; isNew: boolean }) {
  const t = useTranslations("album3d");
  const [drawing, setDrawing] = useState(false);
  if (!booking) return <NotFoundPanel hint={t("myBookingNotFoundHint")} />;
  return drawing && booking.draw && !booking.cancelled ? (
    <PrizeDraw key={booking.token} booking={booking} onBack={() => setDrawing(false)} />
  ) : (
    <Ticket key={booking.token} booking={booking} isNew={isNew} onDraw={() => setDrawing(true)} />
  );
}

/** The panel's opening lines, shared by the ticket and the draw. */
function Heading({ booking }: { booking: MyBooking }) {
  const t = useTranslations("album3d");
  const tb = useTranslations("booking");
  return (
    <>
      <p className={metaLabel}>
        @{booking.username} <span aria-hidden="true" className="mx-2">／</span> {t("crumbMyBooking")}
      </p>
      <h1 className="mt-3 text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] [overflow-wrap:anywhere] wide:text-[3.25rem]">
        {tb("yourBooking")}
      </h1>
      <p className="font-meta mt-3 text-[0.6875rem] uppercase tracking-[0.12em] text-fg-subtle">
        {[booking.title, booking.location].filter(Boolean).join(" · ")}
      </p>
      <div aria-hidden="true" className={styles.calloutRule} />
    </>
  );
}

// ---------------------------------------------------------------- ticket --

function Ticket({ booking, isNew, onDraw }: { booking: MyBooking; isNew: boolean; onDraw: () => void }) {
  const t = useTranslations("album3d");
  const tb = useTranslations("booking");
  const tl = useTranslations("lotteryEntry");
  const { key, touch } = useStage();
  const scene = useScene("board");
  const [editing, setEditing] = useState(false);
  const { cancelled } = booking;
  const status = cancelled ? tb("statusCancelled") : tb("statusConfirmed");

  const tiles = useMemo<BoardTile[]>(
    () => [
      {
        id: "ticket",
        column: 0,
        row: 0,
        kicker: `${booking.day} · ${booking.start}–${booking.end}`,
        main: booking.title,
        detail: [
          [booking.name, booking.subject].filter(Boolean).join(" · "),
          [booking.price, booking.slotDescription, booking.location].filter(Boolean).join(" · ")
        ],
        // One lamp: the visitor's place, dark once given up.
        left: cancelled ? 0 : 1,
        total: 1,
        status
      }
    ],
    [booking, cancelled, status]
  );
  useEffect(() => {
    scene?.setTiles("ticket", `my-booking:${booking.token}`, tiles, [], "");
    scene?.setFocus(0);
    scene?.setCart([]);
  }, [scene, tiles, booking.token]);
  useEffect(() => {
    scene?.stamp(["ticket"], [cancelled ? t("ticketStampCancelled") : t("ticketStampBooked")], {
      keep: true,
      tone: cancelled ? "danger" : "accent"
    });
  }, [scene, cancelled, t]);
  useEffect(() => () => scene?.clearStamps(), [scene]);

  const rows: [string, React.ReactNode][] = [
    [tb("eventLabel"), [booking.title, booking.location].filter(Boolean).join(" · ")],
    [tb("timeLabel"), <span key="time" className="font-meta">{booking.range}</span>],
    ...(booking.price ? [[tb("pricePerPersonLabel"), booking.price] as [string, React.ReactNode]] : []),
    [tb("nameLabel"), booking.name],
    ...(booking.subject ? [[booking.subjectTerm, booking.subject] as [string, React.ReactNode]] : []),
    [
      tb("statusLabel"),
      <span key="status" className={`font-meta text-[0.6875rem] font-semibold uppercase tracking-[0.12em] ${cancelled ? "text-danger" : "text-success"}`}>
        {status}
      </span>
    ]
  ];

  return (
    <>
      <BookingPanel expanded={editing ? "cover" : true}>
        <Heading booking={booking} />

        {isNew && !cancelled && (
          <p role="status" className="mt-5 border-l-2 border-success bg-success-surface px-3 py-2 text-sm leading-6 text-success">
            {tb("saveLinkNotice")}
          </p>
        )}
        {cancelled && (
          <p className="mt-5 border-l-2 border-danger bg-danger-surface px-3 py-2 text-sm text-danger">{tb("bookingCancelledNotice")}</p>
        )}

        <dl className="mt-5 grid gap-px border border-border-strong bg-border-strong text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 bg-page/80 px-4 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-baseline sm:gap-3">
              <dt className={metaLabel}>{label}</dt>
              <dd className="[overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>

        <LocalTimeNote />

        {booking.edit && (
          <section aria-labelledby="album3d-edit-window" className="mt-6">
            <div className={`border-l-2 px-4 py-3 ${booking.edit.open ? "border-accent bg-accent-surface" : "border-border-strong bg-page/70"}`}>
              <p className={`${metaLabel} !text-accent-text`}>{tb("editWindowMarker")}</p>
              <h2 id="album3d-edit-window" className="mt-1 font-bold">
                {booking.edit.open ? tb("editWindowOpenTitle") : tb("editWindowClosedTitle")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-fg-muted">
                {booking.edit.enabled
                  ? booking.edit.open
                    ? tb("editWindowOpenHint", { deadline: booking.edit.deadline })
                    : tb("editWindowClosedHint", { hours: booking.edit.cutoffHours })
                  : tb("editWindowDisabledHint")}
              </p>
            </div>
            {booking.edit.open && booking.edit.initial && (
              <EditForm booking={booking} edit={booking.edit} initial={booking.edit.initial} onToggle={setEditing} />
            )}
          </section>
        )}

        {booking.draw && (
          <section aria-labelledby="album3d-my-draw" className="mt-6">
            <h2 id="album3d-my-draw" className={metaLabel}>{t("crumbDraw")}</h2>
            {booking.wonPrize ? (
              <div className="mt-2 border-l-2 border-accent pl-4">
                <p className="text-sm text-fg-muted">{tl("alreadySpunNotice")}</p>
                <p className="mt-1 text-[1.5rem] font-extrabold uppercase leading-tight tracking-[-0.02em]">{booking.wonPrize.name}</p>
              </div>
            ) : (
              <button type="button" onClick={onDraw} className={`${primaryClass} mt-2`}>
                {t("myBookingOpenDraw")} <span aria-hidden="true">→</span>
              </button>
            )}
          </section>
        )}

        {!cancelled && booking.wonPrize && (
          <p className="mt-6 text-sm text-fg-muted">{tb("cancelWithPrizeContactOwner", { prize: booking.wonPrize.name })}</p>
        )}
        {!cancelled && !booking.wonPrize && <CancelForm token={booking.token} />}
      </BookingPanel>
      {!touch && !editing && <Hints className={styles.menuHint} parts={[`${key("back")} ${t("hintBack")}`]} />}
    </>
  );
}

/** Cancelling asks first, as on the classic page, then the page reloads cancelled. */
function CancelForm({ token }: { token: string }) {
  const tb = useTranslations("booking");
  const { confirm, dialog } = useConfirm();
  return (
    <form action={cancelMyBooking} className="mt-6 border-t border-border-strong pt-5">
      <input type="hidden" name="cancelToken" value={token} />
      <button
        type="submit"
        onClick={(event) => {
          // Hold the submission until the dialog answers, then replay it from this button.
          event.preventDefault();
          const button = event.currentTarget;
          void confirm({ message: tb("confirmCancel"), confirmLabel: tb("cancelButton") }).then((ok) => {
            if (ok) button.form?.requestSubmit(button);
          });
        }}
        className={`${secondaryClass} border-danger-border text-danger hover:border-danger`}
      >
        {tb("cancelButton")}
      </button>
      {dialog}
    </form>
  );
}

function EditForm({
  booking,
  edit,
  initial,
  onToggle
}: {
  booking: MyBooking;
  edit: NonNullable<MyBooking["edit"]>;
  initial: NonNullable<NonNullable<MyBooking["edit"]>["initial"]>;
  onToggle: (open: boolean) => void;
}) {
  const tb = useTranslations("booking");
  const router = useRouter();
  const [state, action, pending] = useActionState<EditBookingState, FormData>(updateMyBooking, {});
  // The action refreshes the classic page; this one reloads its ticket and details itself.
  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
  const error = state.error
    ? {
        validation: tb("editErrorValidation"),
        rateLimited: tb("editErrorRateLimited"),
        notFound: tb("editErrorUnavailable"),
        disabled: tb("editErrorDisabled"),
        cutoff: tb("editErrorCutoff"),
        closed: tb("editErrorClosed"),
        slotUnavailable: tb("editErrorSlotUnavailable"),
        slotFull: tb("editErrorSlotFull")
      }[state.error]
    : null;
  const field = (name: keyof typeof initial, label: string, options: { required?: boolean; type?: string; autoComplete?: string } = {}) => (
    <label className="grid gap-1 text-sm">
      <span className="text-fg-muted">
        {label}
        {options.required && " *"}
      </span>
      <input
        name={name}
        type={options.type ?? "text"}
        required={options.required}
        maxLength={200}
        autoComplete={options.autoComplete ?? "off"}
        defaultValue={initial[name]}
        className={fieldClass}
      />
    </label>
  );

  return (
    <details onToggle={(e) => onToggle(e.currentTarget.open)} className="group mt-3 border border-border-strong bg-page/70">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold uppercase tracking-[0.06em] marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40">
        <span>{tb("editBooking")}</span>
        <span aria-hidden="true" className="text-lg text-accent-text transition-transform duration-150 group-open:rotate-45">
          +
        </span>
      </summary>
      <form action={action} aria-busy={pending} className="grid gap-5 border-t border-border-strong p-4">
        <input type="hidden" name="cancelToken" value={booking.token} />
        <fieldset className="grid gap-2">
          <legend className={`${metaLabel} mb-2`}>{tb("editSchedule")}</legend>
          <label className="grid gap-1 text-sm">
            <span className="text-fg-muted">{tb("timeLabel")}</span>
            <select name="targetSlotId" defaultValue={edit.currentSlotId} className={`${fieldClass} font-meta`}>
              {edit.slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.label}
                </option>
              ))}
            </select>
          </label>
          {edit.slots.length === 1 && <p className="text-xs text-fg-subtle">{tb("noAlternateTimes")}</p>}
        </fieldset>
        <fieldset className="grid gap-3">
          <legend className={`${metaLabel} mb-2`}>{tb("editDetails")}</legend>
          {field("name", tb("name"), { required: true, autoComplete: "name" })}
          {field("subject", tb("subject", { term: booking.subjectTerm }))}
          {field("contactValue", tb("contactValue"), { required: true })}
          {field("email", tb("email"), { type: "email", autoComplete: "email" })}
          <label className="grid gap-1 text-sm">
            <span className="text-fg-muted">{tb("notes")}</span>
            <textarea name="notes" rows={3} maxLength={2000} defaultValue={initial.notes} className={fieldClass} />
          </label>
        </fieldset>
        {error && (
          <p role="alert" className="border-l-2 border-danger bg-danger-surface px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
        {state.ok && !pending && (
          <p role="status" className="border-l-2 border-success bg-success-surface px-3 py-2 text-sm text-success">
            {tb("editSaved")}
          </p>
        )}
        <button type="submit" disabled={pending} className={primaryClass}>
          {pending ? tb("editSaving") : tb("saveBookingChanges")} <span aria-hidden="true">→</span>
        </button>
      </form>
    </details>
  );
}

// ------------------------------------------------------------ prize draw --

type SpinError = "rateLimited" | "notReady" | "notFound" | "alreadySpun" | "noPrizesLeft" | "unknown";

/**
 * The booking's own prize draw: the prizes as the 3D draw's deck, drawn with
 * the classic page's booking-keyed action (spinMyBooking), so the booking
 * itself is the entry.
 */
function PrizeDraw({ booking, onBack }: { booking: MyBooking; onBack: () => void }) {
  const t = useTranslations("album3d");
  const tl = useTranslations("lotteryEntry");
  const { key, touch } = useStage();
  const deck = useScene("deck");
  const [won, setWon] = useState<{ id: string; name: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<SpinError | null>(null);
  const [focus, setFocus] = useState(-1);

  const prizes = useMemo(() => booking.draw?.prizes ?? [], [booking.draw]);
  const already = booking.wonPrize;
  const winner = won ?? already;
  const available = prizes.some((p) => p.quantity - p.wonCount > 0);

  const cards = useMemo<DeckCard[]>(
    () =>
      prizes.map((p) => {
        // Once the page reloads with the win, the count already includes it.
        const left = Math.max(0, p.quantity - p.wonCount - (won?.id === p.id && !already ? 1 : 0));
        return { id: p.id, name: p.name, left, total: p.quantity, status: left > 0 ? t("prizeLeft", { count: left }) : t("prizeOut") };
      }),
    [prizes, won, already, t]
  );
  useEffect(() => {
    deck?.setCards(`my-booking:${booking.token}`, cards, { face: t("deckFace"), back: t("deckBack") });
  }, [deck, cards, booking.token, t]);
  useEffect(() => {
    deck?.setFocus(focus);
  }, [deck, focus]);
  // A prize won earlier is shown raised, without a shuffle.
  useEffect(() => {
    if (deck && already && !won && !drawing) deck.showWon(already.id);
  }, [deck, already, won, drawing]);

  async function spin() {
    if (winner || drawing || !available) return;
    setError(null);
    setDrawing(true);
    setFocus(-1);
    deck?.shuffle();
    try {
      const result = await spinMyBooking(booking.token);
      if (!result.ok) {
        setError(result.error);
        deck?.showWon(null);
        return;
      }
      if (deck) await deck.reveal(result.winner.prizeId);
      setWon({ id: result.winner.prizeId, name: result.winner.prizeName });
    } catch {
      setError("unknown");
      deck?.showWon(null);
    } finally {
      setDrawing(false);
    }
  }

  useScreenKeys((k, target) => {
    if ((k === "Escape" || k === "Backspace") && !drawing) {
      onBack();
      return true;
    }
    if (k === "Enter" && !isInteractive(target)) {
      void spin();
      return true;
    }
    if ((k === "ArrowLeft" || k === "ArrowRight") && cards.length > 0 && !drawing && !winner) {
      setFocus((f) => (f < 0 ? 0 : Math.max(0, Math.min(cards.length - 1, f + (k === "ArrowLeft" ? -1 : 1)))));
      return true;
    }
    return false;
  });
  useStageInput((input) => {
    if (drawing || winner) return;
    if (input.kind === "pick") setFocus(input.index);
    else if (input.kind === "wheel") setFocus((f) => Math.max(0, Math.min(cards.length - 1, f + input.direction)));
    else if (input.x !== 0) setFocus((f) => Math.max(0, Math.min(cards.length - 1, f + input.x)));
  });

  return (
    <>
      <BookingPanel expanded>
        <Heading booking={booking} />
        <button type="button" onClick={onBack} disabled={drawing} className="mt-4 text-sm underline underline-offset-4 disabled:opacity-40">
          <span aria-hidden="true">←</span> {t("myBookingBackToTicket")}
        </button>

        {winner ? (
          <div role="status" aria-live="polite" className="mt-6 border-l-2 border-accent pl-4">
            <p className={metaLabel}>{won ? tl("winnerNotice") : tl("alreadySpunNotice")}</p>
            <p className="mt-1 text-[1.75rem] font-extrabold uppercase leading-tight tracking-[-0.02em]">{winner.name}</p>
          </div>
        ) : (
          <div className="mt-6">
            <button type="button" onClick={() => void spin()} disabled={drawing || !available} aria-busy={drawing} className={primaryClass}>
              {drawing ? t("drawing") : t("drawButton")}
              {!touch && !drawing && <kbd className="font-meta border border-page/40 px-1 text-[0.625rem] font-normal">{key("confirm")}</kbd>}
            </button>
            {!available && <p className="mt-2 text-xs text-fg-subtle">{prizes.length === 0 ? tl("noPrizesYet") : tl("spinError_noPrizesLeft")}</p>}
            {error && (
              <p role="alert" className="mt-2 text-sm text-danger">
                {tl(`spinError_${error}`)}
              </p>
            )}
          </div>
        )}

        {prizes.length > 0 && (
          <section aria-labelledby="album3d-my-prizes" className="mt-6">
            <h2 id="album3d-my-prizes" className={metaLabel}>{t("prizesTitle")}</h2>
            <ul className="mt-2 grid gap-1 text-sm">
              {cards.map((card, i) => (
                <li key={card.id} className={`flex justify-between gap-4 ${i === focus ? "text-fg" : "text-fg-muted"}`}>
                  <span className="truncate">
                    <span aria-hidden="true" className="font-meta mr-2 text-[0.625rem] text-fg-subtle">{pad(i + 1)}</span>
                    {card.name}
                  </span>
                  <span className="font-meta shrink-0 text-[0.625rem] uppercase tracking-[0.12em]">{card.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </BookingPanel>
      {!touch && !winner && (
        <Hints
          className={styles.menuHint}
          parts={[`${key("sides")} ${t("hintPrize")}`, `${key("confirm")} ${t("hintDraw")}`, `${key("back")} ${t("hintBack")}`]}
        />
      )}
    </>
  );
}
