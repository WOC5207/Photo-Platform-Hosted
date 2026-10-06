"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { SharepostStep } from "@/lib/siteMode";
import { pad } from "../../hud";
import { useStage } from "../../booking/shared";
import { useSharepostStudio } from "./SharepostStudio";

type Step = "photos" | SharepostStep;

const STEPS: { step: Step; label: string }[] = [
  { step: "photos", label: "creatorStepPhotos" },
  { step: "layout", label: "creatorLayout" },
  { step: "credits", label: "creatorCredits" },
  { step: "print", label: "creatorPrint" }
];

/**
 * The Sharepost steps at the top of each screen's panel: Back (one step
 * back, the same as Esc, and the only way back on touch screens) and every
 * step, so any one is a click away. Print waits for a photograph, as it
 * does on the menu. The bar stays at the top while the panel scrolls, on one
 * row: on phones Back and the steps other than this one show only their
 * arrow and number (their names are still read out).
 */
export function SharepostSteps({ current }: { current: Step }) {
  const t = useTranslations("album3d");
  const { back, path } = useStage();
  const { photos, screen } = useSharepostStudio();
  return (
    <nav aria-label={t("creatorStepsLabel")} className="sticky top-[calc(var(--panel-pad-top,0px)*-1)] z-10 mt-[calc(var(--panel-pad-top,0px)*-1)] mb-6 flex items-center gap-x-2 border-b border-border bg-page/95 pt-[var(--panel-pad-top,0px)] pb-2 backdrop-blur-sm">
      <button
        type="button"
        onClick={back}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 border border-border-strong px-3 text-sm uppercase tracking-[0.06em] transition hover:border-fg sm:mr-2"
      >
        <span aria-hidden="true">←</span>
        <span className="max-sm:sr-only">{t("back")}</span>
      </button>
      <ol className="flex min-w-0 flex-wrap items-center">
        {STEPS.map(({ step, label }, i) => {
          const here = step === current;
          const closed = step === "print" && photos.length === 0;
          const text = (
            <>
              <span className={`font-meta text-[0.625rem] text-fg-subtle ${here ? "mr-1.5" : "sm:mr-1.5"}`}>{pad(i + 1)}</span>
              <span className={here ? undefined : "max-sm:sr-only"}>{t(label)}</span>
            </>
          );
          const base = "inline-flex min-h-11 min-w-11 items-center justify-center border-b-2 px-2 text-xs uppercase tracking-[0.08em]";
          return (
            <li key={step}>
              {here ? (
                <span aria-current="step" className={`${base} border-accent font-semibold`}>
                  {text}
                </span>
              ) : closed ? (
                <span aria-disabled="true" className={`${base} border-transparent text-fg-faint`}>
                  {text}
                </span>
              ) : (
                <Link href={path(screen(step === "photos" ? undefined : step))} scroll={false} className={`${base} border-transparent text-fg-muted transition hover:border-fg-subtle hover:text-fg`}>
                  {text}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The step after this one, at the foot of a long panel. */
export function SharepostNext({ to }: { to: SharepostStep }) {
  const t = useTranslations("album3d");
  const { path } = useStage();
  const { photos, screen } = useSharepostStudio();
  if (to === "print" && photos.length === 0) return null;
  const label = to === "layout" ? "creatorLayout" : to === "credits" ? "creatorCredits" : "creatorPrint";
  return (
    <Link
      href={path(screen(to))}
      scroll={false}
      className="mt-6 inline-flex min-h-12 w-full items-center justify-between gap-4 bg-fg px-5 text-sm font-semibold uppercase tracking-[0.08em] text-page transition hover:bg-accent-text"
    >
      {t("creatorNextStep", { step: t(label) })}
      <span aria-hidden="true" className="text-lg">→</span>
    </Link>
  );
}
