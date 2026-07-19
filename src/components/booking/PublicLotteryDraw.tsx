"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  spinMyLotteryEntry,
  type PublicSpinResult,
  type VisitorLotteryEntry
} from "@/app/[locale]/(public)/draw/actions";
import LotteryWheel from "@/components/admin/LotteryWheel";

export interface PublicLotteryPrize {
  id: string;
  name: string;
  quantity: number;
  weight: number;
  wonCount: number;
}

type LotteryWinner = Extract<PublicSpinResult, { ok: true }>["winner"];

export default function PublicLotteryDraw({
  drawToken,
  entry,
  prizes
}: {
  drawToken: string;
  entry: VisitorLotteryEntry;
  prizes: PublicLotteryPrize[];
}) {
  const t = useTranslations("lotteryEntry");
  const myPrize = entry.wonPrizeId
    ? prizes.find((prize) => prize.id === entry.wonPrizeId)
    : undefined;
  const wheelSlices = useMemo(
    () =>
      prizes
        .filter((prize) => prize.quantity - prize.wonCount > 0)
        .map((prize) => ({ id: prize.id, label: prize.name, weight: prize.weight })),
    [prizes]
  );

  const [spinning, setSpinning] = useState(false);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [pendingWinner, setPendingWinner] = useState<LotteryWinner | null>(null);
  const [revealedWinner, setRevealedWinner] = useState<LotteryWinner>();
  const [spinError, setSpinError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (entry.wonPrizeId) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">{t("spinTitle")}</h2>
        <div className="w-full rounded-lg border border-success-border bg-success-surface p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-success">
            {t("alreadySpunNotice")}
          </p>
          <p className="mt-1 text-lg font-bold text-success-strong">
            {myPrize?.name ?? ""}
          </p>
        </div>
      </div>
    );
  }

  const canSpin =
    !spinning && !busy && !pendingWinner && !revealedWinner && wheelSlices.length > 0;

  async function handleSpin() {
    if (!canSpin) return;
    setSpinError(undefined);
    setRevealedWinner(undefined);
    setBusy(true);
    const result = await spinMyLotteryEntry(drawToken);
    setBusy(false);
    if (!result.ok) {
      setSpinError(result.error);
      return;
    }
    const index = wheelSlices.findIndex((slice) => slice.id === result.winner.prizeId);
    if (index === -1) {
      setRevealedWinner(result.winner);
      return;
    }
    setPendingWinner(result.winner);
    setTargetIndex(index);
    setSpinning(true);
  }

  function handleSpinComplete() {
    setSpinning(false);
    setRevealedWinner(pendingWinner ?? undefined);
    setPendingWinner(null);
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-surface p-6">
      <h2 className="text-lg font-semibold">{t("spinTitle")}</h2>
      <LotteryWheel
        slices={wheelSlices}
        spinning={spinning}
        targetIndex={targetIndex}
        onSpinComplete={handleSpinComplete}
      />
      <button
        type="button"
        onClick={handleSpin}
        disabled={!canSpin}
        className="rounded-full bg-fg px-6 py-3 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
      >
        {spinning ? t("spinning") : t("spin")}
      </button>
      {wheelSlices.length === 0 && (
        <p className="text-xs text-fg-subtle">{t("noPrizesYet")}</p>
      )}
      {spinError && (
        <p className="text-xs text-danger">{t(`spinError_${spinError}`)}</p>
      )}
      {revealedWinner && (
        <div className="w-full rounded-lg border border-success-border bg-success-surface p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-success">
            {t("winnerNotice")}
          </p>
          <p className="mt-1 text-lg font-bold text-success-strong">
            {revealedWinner.prizeName}
          </p>
        </div>
      )}
    </div>
  );
}
