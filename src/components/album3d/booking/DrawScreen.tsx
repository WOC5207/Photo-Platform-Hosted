"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  recoverLotteryEntry,
  spinMyLotteryEntry,
  submitLotteryEntry,
  type LotteryEntryFormState
} from "@/app/[locale]/(public)/draw/actions";
import { Hints, pad } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { DeckCard } from "../deck";
import type { PrizeDraw } from "./types";
import {
  BookingPanel,
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
 * A booking event's prize draw. The prizes are a deck of cards in the scene;
 * once entered, drawing shuffles the deck face down while the server picks
 * (the classic draw's own action), then the won card rises and turns over.
 */
export default function DrawScreen({ draw }: { draw: PrizeDraw | null }) {
  if (!draw) return <NotFoundPanel />;
  return <Draw key={draw.token} draw={draw} />;
}

type SpinError = "rateLimited" | "notFound" | "alreadySpun" | "noPrizesLeft" | "unknown";

function Draw({ draw }: { draw: PrizeDraw }) {
  const t = useTranslations("album3d");
  const tl = useTranslations("lotteryEntry");
  const { key, touch } = useStage();
  const deck = useScene("deck");
  const [entryState, entryAction, entryPending] = useActionState<LotteryEntryFormState, FormData>(submitLotteryEntry, {});
  const [recoveryState, recoveryAction, recoveryPending] = useActionState<LotteryEntryFormState, FormData>(recoverLotteryEntry, {});
  const entry = entryState.entry ?? recoveryState.entry ?? draw.entry;
  const [won, setWon] = useState<{ id: string; name: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<SpinError | null>(null);
  const [focus, setFocus] = useState(-1);
  const [copied, setCopied] = useState(false);
  const tokenRef = useRef<HTMLInputElement>(null);

  const prizes = draw.prizes;
  const already = entry?.wonPrizeId ? (prizes.find((p) => p.id === entry.wonPrizeId) ?? null) : null;
  const winner = won ?? (already ? { id: already.id, name: already.name } : null);
  const available = prizes.some((p) => p.quantity - p.wonCount > 0);

  const cards = useMemo<DeckCard[]>(
    () =>
      prizes.map((p) => {
        const left = Math.max(0, p.quantity - p.wonCount - (won?.id === p.id ? 1 : 0));
        return { id: p.id, name: p.name, left, total: p.quantity, status: left > 0 ? t("prizeLeft", { count: left }) : t("prizeOut") };
      }),
    [prizes, won, t]
  );
  useEffect(() => {
    deck?.setCards(`draw:${draw.token}`, cards, { face: t("deckFace"), back: t("deckBack") });
  }, [deck, cards, draw.token, t]);
  useEffect(() => {
    deck?.setFocus(focus);
  }, [deck, focus]);
  // A prize won earlier is shown raised, without a shuffle.
  useEffect(() => {
    if (deck && already && !won && !drawing) deck.showWon(already.id);
  }, [deck, already, won, drawing]);

  async function spin() {
    if (!entry || winner || drawing || !available) return;
    setError(null);
    setDrawing(true);
    setFocus(-1);
    deck?.shuffle();
    try {
      const result = await spinMyLotteryEntry(draw.token, entry.id);
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

  async function copy() {
    if (!entry) return;
    try {
      await navigator.clipboard.writeText(entry.token);
      setCopied(true);
    } catch {
      tokenRef.current?.select();
    }
  }

  useScreenKeys((k, target) => {
    if (k === "Enter" && entry && !isInteractive(target)) {
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

  const formError = (state: LotteryEntryFormState) =>
    state.error
      ? tl(
          {
            validation: "errorValidation",
            rateLimited: "errorRateLimited",
            closed: "errorClosed",
            duplicate: "errorDuplicate",
            notFound: "recoveryNotFound"
          }[state.error]
        )
      : null;
  const contactFields = (prefix: string) => (
    <>
      <label className="grid gap-1 text-sm">
        <span className="text-fg-muted">{tl("name")} *</span>
        <input id={`${prefix}-name`} name="name" required maxLength={200} autoComplete="name" className={fieldClass} />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-fg-muted">{tl("contactValue")} *</span>
        <input id={`${prefix}-contact`} name="contactValue" required maxLength={200} className={fieldClass} />
        <span className="text-xs text-fg-subtle">{tl("contactHint")}</span>
      </label>
    </>
  );

  return (
    <>
      <BookingPanel expanded={!entry}>
        <p className={metaLabel}>
          @{draw.username} <span aria-hidden="true" className="mx-2">／</span> {t("crumbDraw")}
        </p>
        <h1 className="mt-3 text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] [overflow-wrap:anywhere] wide:text-[3.25rem]">
          {draw.title}
        </h1>
        <p className="font-meta mt-3 text-[0.6875rem] uppercase tracking-[0.12em] text-fg-subtle">
          {[draw.dates, draw.location].filter(Boolean).join(" · ")}
        </p>
        <div aria-hidden="true" className={styles.calloutRule} />

        {!entry ? (
          <div className="mt-5">
            <h2 className="text-xl font-bold tracking-[-0.02em]">{tl("title")}</h2>
            <form action={entryAction} aria-busy={entryPending} className="mt-3 grid gap-3">
              <input type="hidden" name="drawToken" value={draw.token} />
              {contactFields("album3d-entry")}
              {formError(entryState) && <p role="alert" className="text-sm text-danger">{formError(entryState)}</p>}
              <button type="submit" disabled={entryPending} className={primaryClass}>
                {tl("submit")} <span aria-hidden="true">→</span>
              </button>
            </form>
            <details className="mt-4 border border-border-strong p-3">
              <summary className="cursor-pointer text-sm font-semibold">{tl("recoveryTitle")}</summary>
              <form action={recoveryAction} aria-busy={recoveryPending} className="mt-3 grid gap-3">
                <input type="hidden" name="drawToken" value={draw.token} />
                <p className="text-xs text-fg-muted">{tl("recoveryHint")}</p>
                <label className="grid gap-1 text-sm">
                  <span className="text-fg-muted">{tl("yourToken")} *</span>
                  <input name="entryToken" required minLength={5} maxLength={12} className={`${fieldClass} font-meta uppercase`} />
                </label>
                {contactFields("album3d-recover")}
                {formError(recoveryState) && <p role="alert" className="text-sm text-danger">{formError(recoveryState)}</p>}
                <button type="submit" disabled={recoveryPending} className={secondaryClass}>
                  {tl("recoverySubmit")}
                </button>
              </form>
            </details>
          </div>
        ) : (
          <div className="mt-5">
            <div role={entryState.ok || recoveryState.ok ? "status" : undefined}>
              {(entryState.ok || recoveryState.ok) && <p className="text-sm text-success">{t("drawEntered")}</p>}
              <p className={`${metaLabel} mt-2`}>{tl("yourToken")}</p>
              <div className="mt-1 flex items-stretch gap-2">
                <input
                  ref={tokenRef}
                  readOnly
                  value={entry.token}
                  aria-label={tl("yourToken")}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-meta min-h-11 w-40 border border-border-strong bg-page/70 px-3 text-lg font-bold tracking-[0.12em] outline-none"
                />
                <button type="button" onClick={copy} className={secondaryClass}>
                  {copied ? tl("copied") : tl("copyToken")}
                </button>
              </div>
            </div>

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
          </div>
        )}

        {prizes.length > 0 && (
          <section aria-labelledby="album3d-prizes" className="mt-6">
            <h2 id="album3d-prizes" className={metaLabel}>{t("prizesTitle")}</h2>
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
        <p className="mt-5 text-xs text-fg-muted">
          <Link href={`/draw/${draw.token}`} className="underline-offset-4 hover:text-fg hover:underline">
            {t("drawClassic")} ↗
          </Link>
        </p>
      </BookingPanel>
      {!touch && entry && !winner && (
        <Hints
          className={styles.menuHint}
          parts={[`${key("sides")} ${t("hintPrize")}`, `${key("confirm")} ${t("hintDraw")}`, `${key("back")} ${t("hintBack")}`]}
        />
      )}
    </>
  );
}
