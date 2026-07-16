"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  addLotteryEntries,
  addLotteryPrize,
  deleteLotteryPrize,
  removeLotteryEntry,
  spinLotteryEntry,
  updateLotteryPrize,
  type LotteryPrizeState,
  type SpinResult
} from "@/app/[locale]/admin/(protected)/bookings/lottery-actions";
import LotteryWheel from "./LotteryWheel";

type LotteryWinner = Extract<SpinResult, { ok: true }>["winner"];

export interface AdminAvailableBooking {
  id: string;
  name: string;
  subject: string;
}

export interface AdminLotteryEntry {
  id: string;
  token: string;
  name: string;
  subject: string;
  wonPrizeId: string | null;
}

export interface AdminLotteryPrize {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  wonCount: number;
}

const btnCls =
  "rounded-md border border-border-strong px-2 py-1 text-xs text-fg-muted transition hover:border-fg-faint hover:text-fg disabled:opacity-40";
const inputCls =
  "min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg-subtle";

function displayName(b: { name: string; subject: string }) {
  return b.subject ? `${b.name} · ${b.subject}` : b.name;
}

export default function LotteryManager({
  bookingEventId,
  availableBookings,
  entries,
  prizes
}: {
  bookingEventId: string;
  availableBookings: AdminAvailableBooking[];
  entries: AdminLotteryEntry[];
  prizes: AdminLotteryPrize[];
}) {
  const t = useTranslations("adminLottery");

  const pool = useMemo(() => entries.filter((e) => !e.wonPrizeId), [entries]);
  const prizesWithRemaining = useMemo(
    () => prizes.map((p) => ({ ...p, remaining: p.quantity - p.wonCount })),
    [prizes]
  );
  const wheelSlices = useMemo(
    () =>
      prizesWithRemaining
        .filter((p) => p.remaining > 0)
        .map((p) => ({ id: p.id, label: p.name, weight: p.weight })),
    [prizesWithRemaining]
  );

  const [selectedEntryId, setSelectedEntryId] = useState<string>(
    pool[0]?.id ?? ""
  );
  const [spinning, setSpinning] = useState(false);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [pendingWinner, setPendingWinner] = useState<LotteryWinner | null>(null);
  const [revealedWinner, setRevealedWinner] = useState<LotteryWinner | undefined>();
  const [spinError, setSpinError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSpin = !spinning && !busy && !!selectedEntryId && wheelSlices.length > 0;

  async function handleSpin() {
    if (!canSpin) return;
    setSpinError(null);
    setRevealedWinner(undefined);
    setBusy(true);
    const result = await spinLotteryEntry(selectedEntryId);
    setBusy(false);
    if (!result.ok) {
      setSpinError(result.error);
      return;
    }
    const idx = wheelSlices.findIndex((s) => s.id === result.winner.prizeId);
    if (idx === -1) {
      // Local slice list is stale (e.g. the prize sold out between render
      // and this spin) — reveal directly instead of animating to a slice
      // that no longer matches what's on screen.
      setRevealedWinner(result.winner);
      return;
    }
    setPendingWinner(result.winner);
    setTargetIndex(idx);
    setSpinning(true);
  }

  function handleSpinComplete() {
    setSpinning(false);
    setRevealedWinner(pendingWinner ?? undefined);
    setPendingWinner(null);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-6">
        <LotteryWheel
          slices={wheelSlices}
          spinning={spinning}
          targetIndex={targetIndex}
          onSpinComplete={handleSpinComplete}
        />

        <select
          value={selectedEntryId}
          onChange={(e) => setSelectedEntryId(e.target.value)}
          className="w-full max-w-xs flex-none rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-fg outline-none focus:border-fg-subtle"
        >
          <option value="">{t("chooseEntrant")}</option>
          {pool.map((e) => (
            <option key={e.id} value={e.id}>
              {e.token} · {displayName(e)}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleSpin}
          disabled={!canSpin}
          className="rounded-lg bg-fg px-6 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-40"
        >
          {spinning ? t("spinning") : t("spin")}
        </button>

        {pool.length === 0 && (
          <p className="text-xs text-fg-subtle">{t("noEntriesLeft")}</p>
        )}
        {pool.length > 0 && wheelSlices.length === 0 && (
          <p className="text-xs text-fg-subtle">{t("noPrizesYet")}</p>
        )}

        {spinError && (
          <p className="text-xs text-danger">{t(`spinError_${spinError}`)}</p>
        )}

        {revealedWinner && (
          <div className="w-full rounded-lg border border-success-border bg-success-surface p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-success">
              {t("winnerPrize", { prize: revealedWinner.prizeName })}
            </p>
            <p className="mt-1 text-lg font-bold text-success-strong">
              {displayName(revealedWinner)}
            </p>
            <p className="font-mono text-sm text-success">
              {revealedWinner.token}
            </p>
          </div>
        )}

        {entries.some((e) => e.wonPrizeId) && (
          <div className="w-full border-t border-border pt-3">
            <p className="mb-2 text-xs font-semibold text-fg-subtle">
              {t("winnersHistory")}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {entries
                .filter((e) => e.wonPrizeId)
                .map((e) => (
                  <li key={e.id} className="flex justify-between gap-2">
                    <span>{displayName(e)}</span>
                    <span className="text-fg-subtle">
                      {prizes.find((p) => p.id === e.wonPrizeId)?.name}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </section>

      <div className="flex flex-col gap-6">
        <PrizeManager bookingEventId={bookingEventId} prizes={prizesWithRemaining} />
        <EntryManager
          bookingEventId={bookingEventId}
          availableBookings={availableBookings}
          entries={entries}
        />
      </div>
    </div>
  );
}

function PrizeManager({
  bookingEventId,
  prizes
}: {
  bookingEventId: string;
  prizes: (AdminLotteryPrize & { remaining: number })[];
}) {
  const t = useTranslations("adminLottery");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<LotteryPrizeState, FormData>(
    addLotteryPrize,
    {}
  );

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">{t("prizesSection")}</h2>

      {prizes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {prizes.map((p) => (
            <li key={p.id} className="rounded-lg border border-border-strong/40 p-2">
              <form action={updateLotteryPrize} className="flex flex-col gap-1.5">
                <input type="hidden" name="prizeId" value={p.id} />
                <input
                  name="name"
                  defaultValue={p.name}
                  maxLength={200}
                  className={inputCls}
                />
                <div className="flex gap-2">
                  <label className="flex flex-1 items-center gap-1 text-xs text-fg-subtle">
                    {t("prizeQuantity")}
                    <input
                      name="quantity"
                      type="number"
                      min={1}
                      max={9999}
                      defaultValue={p.quantity}
                      className={`${inputCls} w-16 flex-none`}
                    />
                  </label>
                  <label className="flex flex-1 items-center gap-1 text-xs text-fg-subtle">
                    {t("prizeChance")}
                    <input
                      name="weight"
                      type="number"
                      min={1}
                      max={9999}
                      defaultValue={p.weight}
                      className={`${inputCls} w-16 flex-none`}
                    />
                  </label>
                  <button type="submit" className={btnCls}>
                    {tc("save")}
                  </button>
                </div>
              </form>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-fg-subtle">
                  {t("prizeRemaining", { remaining: p.remaining, quantity: p.quantity })}
                </span>
                <form action={deleteLotteryPrize}>
                  <input type="hidden" name="prizeId" value={p.id} />
                  <button
                    type="submit"
                    className={`${btnCls} border-danger-border text-danger hover:border-danger hover:text-danger-strong`}
                  >
                    {tc("delete")}
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}

      <form
        action={formAction}
        className="flex flex-col gap-2 rounded-lg border border-dashed border-border-strong p-3"
      >
        <input type="hidden" name="bookingEventId" value={bookingEventId} />
        <input
          name="name"
          placeholder={t("prizeName")}
          maxLength={200}
          required
          className={inputCls}
        />
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-1 text-xs text-fg-subtle">
            {t("prizeQuantity")}
            <input
              name="quantity"
              type="number"
              min={1}
              max={9999}
              defaultValue={1}
              required
              className={`${inputCls} w-16 flex-none`}
            />
          </label>
          <label className="flex flex-1 items-center gap-1 text-xs text-fg-subtle">
            {t("prizeChance")}
            <input
              name="weight"
              type="number"
              min={1}
              max={9999}
              defaultValue={1}
              required
              className={`${inputCls} w-16 flex-none`}
            />
          </label>
        </div>
        <p className="text-xs text-fg-subtle">{t("prizeChanceHint")}</p>
        <button type="submit" disabled={pending} className={`${btnCls} self-start`}>
          + {t("addPrize")}
        </button>
        {state.error && (
          <p className="text-xs text-danger">{t("prizeValidationError")}</p>
        )}
      </form>
    </section>
  );
}

function EntryManager({
  bookingEventId,
  availableBookings,
  entries
}: {
  bookingEventId: string;
  availableBookings: AdminAvailableBooking[];
  entries: AdminLotteryEntry[];
}) {
  const t = useTranslations("adminLottery");

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm font-semibold">{t("entriesSection")}</h2>
      <p className="-mt-1 text-xs text-fg-subtle">{t("entriesHint")}</p>

      {entries.length > 0 && (
        <ul className="flex flex-col gap-1">
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border-strong/40 px-2 py-1 text-sm"
            >
              <span>
                <span className="font-mono text-xs text-fg-subtle">{e.token}</span>{" "}
                {displayName(e)}
              </span>
              {!e.wonPrizeId && (
                <form action={removeLotteryEntry}>
                  <input type="hidden" name="entryId" value={e.id} />
                  <button
                    type="submit"
                    aria-label={t("removeEntryAria")}
                    className={btnCls}
                  >
                    ×
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {availableBookings.length === 0 ? (
        <p className="text-xs text-fg-subtle">{t("noAvailableBookings")}</p>
      ) : (
        <form action={addLotteryEntries} className="flex flex-col gap-2">
          <input type="hidden" name="bookingEventId" value={bookingEventId} />
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border-strong/40 p-2">
            {availableBookings.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="bookingIds" value={b.id} id={`b-${b.id}`} />
                <label htmlFor={`b-${b.id}`}>{displayName(b)}</label>
              </li>
            ))}
          </ul>
          <button type="submit" className={`${btnCls} self-start`}>
            + {t("addSelectedEntries")}
          </button>
        </form>
      )}
    </section>
  );
}
