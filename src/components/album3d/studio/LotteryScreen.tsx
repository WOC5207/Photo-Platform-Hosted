"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { spinLotteryEntry, type SpinResult } from "@/app/[locale]/dashboard/(protected)/bookings/lottery-actions";
import CopyButton from "@/components/admin/CopyButton";
import { EntryManager, PrizeManager } from "@/components/admin/LotteryManager";
import LotteryOpenToggle from "@/components/admin/LotteryOpenToggle";
import { Hints } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { DeckCard } from "../deck";
import { BookingPanel, fieldClass, isInteractive, metaLabel, primaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { StudioHeading } from "./shared";
import type { StudioLottery } from "./types";

type Winner = Extract<SpinResult, { ok: true }>["winner"];
type SpinError = Extract<SpinResult, { ok: false }>["error"] | "unknown";

const named = (e: { name: string; subject: string }) => (e.subject ? `${e.name} · ${e.subject}` : e.name);

/**
 * The prize draw, run by the photographer for an entrant at the table: the
 * prizes are the deck of cards in the scene, and drawing for the chosen
 * entrant shuffles it face down while the server picks (the classic draw's
 * own action), then the won card rises and turns over. Prizes and entrants
 * are kept in the panel with the classic tool's forms.
 */
export default function LotteryScreen({ lottery }: { lottery: StudioLottery }) {
  const t = useTranslations("album3d");
  const tl = useTranslations("adminLottery");
  const tb = useTranslations("adminBookings");
  const ts = useTranslations("adminSite");
  const tc = useTranslations("common");
  const { key, touch } = useStage();
  const deck = useScene("deck");
  const [entrant, setEntrant] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [winner, setWinner] = useState<Winner | null>(null);
  const [error, setError] = useState<SpinError | null>(null);
  const [focus, setFocus] = useState(-1);

  const pool = useMemo(() => lottery.entries.filter((e) => !e.wonPrizeId), [lottery.entries]);
  const chosen = pool.find((e) => e.id === entrant) ?? pool[0];
  const prizes = useMemo(() => lottery.prizes.map((p) => ({ ...p, remaining: p.quantity - p.wonCount })), [lottery.prizes]);
  const stocked = prizes.some((p) => p.remaining > 0);

  const cards = useMemo<DeckCard[]>(
    () =>
      prizes.map((p) => ({
        id: p.id,
        name: p.name,
        left: Math.max(0, p.remaining),
        total: p.quantity,
        status: p.remaining > 0 ? t("prizeLeft", { count: p.remaining }) : t("prizeOut")
      })),
    [prizes, t]
  );
  useEffect(() => {
    deck?.setCards(`studio-draw:${lottery.drawId}`, cards, { face: t("deckFace"), back: t("deckBack") });
  }, [deck, cards, lottery.drawId, t]);
  useEffect(() => {
    deck?.setFocus(focus);
  }, [deck, focus]);

  async function draw() {
    if (!chosen || drawing || !stocked) return;
    setError(null);
    setWinner(null);
    setDrawing(true);
    setFocus(-1);
    deck?.shuffle();
    try {
      const result = await spinLotteryEntry(chosen.id);
      if (!result.ok) {
        setError(result.error);
        deck?.showWon(null);
        return;
      }
      if (deck) await deck.reveal(result.winner.prizeId);
      setWinner(result.winner);
      setEntrant("");
    } catch {
      setError("unknown");
      deck?.showWon(null);
    } finally {
      setDrawing(false);
    }
  }

  useScreenKeys((k, target) => {
    if (k === "Enter" && !isInteractive(target)) {
      void draw();
      return true;
    }
    if ((k === "ArrowLeft" || k === "ArrowRight") && cards.length > 0 && !drawing) {
      setFocus((f) => (f < 0 ? 0 : Math.max(0, Math.min(cards.length - 1, f + (k === "ArrowLeft" ? -1 : 1)))));
      return true;
    }
    return false;
  });
  useStageInput((input) => {
    if (drawing) return;
    if (input.kind === "pick") setFocus(input.index);
    else if (input.kind === "wheel") setFocus((f) => Math.max(0, Math.min(cards.length - 1, f + input.direction)));
    else if (input.x !== 0) setFocus((f) => Math.max(0, Math.min(cards.length - 1, f + input.x)));
  });

  const winners = lottery.entries.filter((e) => e.wonPrizeId);

  return (
    <>
      <BookingPanel expanded>
        <StudioHeading trail={lottery.title} title={tl("title")} />
        {!lottery.public && <p role="status" className="mt-5 text-sm text-fg-muted">{ts("groupLotteryHint")}</p>}

        <div className="mt-6 border border-border-strong p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={metaLabel}>{tl("shareLink")}</p>
            {!lottery.public && <span className="font-meta text-[0.625rem] uppercase tracking-[0.12em] text-fg-subtle">{tb("offPublicly")}</span>}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all text-xs text-success">{lottery.shareUrl}</code>
            <CopyButton text={lottery.shareUrl} label={tc("copyLink")} copiedLabel={tc("copied")} />
          </div>
          <div className="mt-3">
            <LotteryOpenToggle drawId={lottery.drawId} defaultOpen={lottery.open} openLabel={tl("openForEntry")} />
            <p className="mt-1 text-xs text-fg-subtle">{tl("openForEntryHint")}</p>
          </div>
        </div>

        <section aria-labelledby="studio-draw" aria-busy={drawing} className="mt-6 grid gap-3">
          <h2 id="studio-draw" className={metaLabel}>{t("studioDrawFor")}</h2>
          {pool.length === 0 ? (
            <p className="text-sm text-fg-muted">{tl("noEntriesLeft")}</p>
          ) : (
            <select
              value={chosen?.id ?? ""}
              onChange={(e) => setEntrant(e.target.value)}
              disabled={drawing}
              aria-label={tl("chooseEntrant")}
              className={fieldClass}
            >
              {pool.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.token} · {named(e)}
                </option>
              ))}
            </select>
          )}
          {pool.length > 0 && !stocked && <p className="text-sm text-fg-muted">{tl("noPrizesYet")}</p>}
          <button type="button" disabled={!chosen || drawing || !stocked} onClick={() => void draw()} className={primaryClass}>
            {drawing ? tl("spinning") : t("studioDraw")}
            {!touch && <kbd className="font-meta border border-page/40 px-1 text-[0.625rem] font-normal">{key("confirm")}</kbd>}
          </button>
          {error && <p role="alert" className="text-sm text-danger">{tl(`spinError_${error}`)}</p>}
          {winner && (
            <div role="status" className="border-l-2 border-accent bg-page/80 py-2 pl-3">
              <p className={metaLabel}>{tl("winnerPrize", { prize: winner.prizeName })}</p>
              <p className="mt-1 text-lg font-bold">{named(winner)}</p>
              <p className="font-meta text-sm text-fg-muted">{winner.token}</p>
            </div>
          )}
          {winners.length > 0 && (
            <div className="border-t border-border pt-3">
              <p className={metaLabel}>{tl("winnersHistory")}</p>
              <ul className="mt-2 grid gap-1 text-sm">
                {winners.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span>{named(e)}</span>
                    <span className="text-fg-subtle">{lottery.prizes.find((p) => p.id === e.wonPrizeId)?.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="mt-6 grid gap-4">
          <PrizeManager bookingEventId={lottery.id} prizes={prizes} locked={drawing} />
          <EntryManager bookingEventId={lottery.id} availableBookings={lottery.available} entries={lottery.entries} />
        </div>
      </BookingPanel>
      {!touch && (
        <Hints className={styles.menuHint} parts={[`← → ${t("hintSelect")}`, `${key("confirm")} ${t("studioDraw")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
