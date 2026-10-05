"use client";

import { useActionState, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  completeSetup,
  setupUpdateBrand,
  setupUpdateCredentials,
  setupUpdateFeatures,
  setupUpdateHomeText,
  type CredentialsState
} from "@/app/[locale]/dashboard/setup/actions";
import { logout3d } from "@/app/[locale]/3d/login/actions";
import { Rolling, pad } from "../hud";
import type { BoardTile } from "../board";
import { BookingPanel, fieldClass, metaLabel, primaryClass, secondaryClass } from "../booking/shared";
import { FormNote, StudioHeading } from "./shared";
import { checkClass, labelClass, useSiteBoard } from "./site";
import type { StudioSetup } from "./types";

type StepId = "credentials" | "brand" | "hometext" | "features" | "finish";

/**
 * A new account's first-run setup in 3D: the classic wizard's steps (its
 * actions too) as a checklist of cards on the board, lit as each is done,
 * and the current step's form in the panel. The logo, background and
 * profile links are left to Site settings afterwards.
 */
export default function SetupScreen({ setup }: { setup: StudioSetup }) {
  const t = useTranslations("setup");
  const ta = useTranslations("album3d");
  const steps = useMemo<StepId[]>(
    () => [...(setup.needsCredentials ? (["credentials"] as const) : []), "brand", "hometext", "features", "finish"],
    [setup.needsCredentials]
  );
  const [done, setDone] = useState(0);
  const step = steps[Math.min(done, steps.length - 1)];
  const titles: Record<StepId, string> = {
    credentials: t("credentialsTitle"),
    brand: t("brandTitle"),
    hometext: t("hometextTitle"),
    features: t("featuresTitle"),
    finish: t("finishTitle")
  };

  const tiles = useMemo<BoardTile[]>(
    () =>
      steps.map((id, i) => ({
        id,
        column: 0,
        row: i,
        kicker: t("stepOf", { current: i + 1, total: steps.length }),
        main: titles[id],
        detail: [],
        // Done and current steps are lit; the ones still to come are dimmed.
        left: i <= done ? 1 : 0,
        total: 1,
        status: i < done ? "✓" : i === done ? "●" : ""
      })),
    // titles follow t.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [steps, done, t]
  );
  const [, setFocus] = useSiteBoard(`studio-setup:${setup.username}`, tiles);
  useEffect(() => setFocus(done), [done, setFocus]);

  const next = () => setDone((d) => Math.min(steps.length - 1, d + 1));
  const back = done > 0 ? () => setDone((d) => d - 1) : undefined;

  return (
    <BookingPanel expanded>
      <StudioHeading trail={ta("studioCrumbs.setup")} title={t("welcomeTitle")}>
        <p className="mt-3 text-sm text-fg-muted">{t("welcomeHint")}</p>
      </StudioHeading>
      <p className={`${metaLabel} mt-6`}>
        <span className="text-fg">
          <Rolling value={pad(done + 1)} />
        </span>{" "}
        / {pad(steps.length)}
      </p>
      <section key={step} aria-labelledby="studio-setup-title" className="mt-2 grid gap-4">
        <div>
          <h2 id="studio-setup-title" className="text-xl font-bold tracking-[-0.01em]">
            {titles[step]}
          </h2>
        </div>
        {step === "credentials" && <CredentialsStep username={setup.username} onDone={next} />}
        {step === "brand" && (
          <SimpleStep action={setupUpdateBrand} hint={t("brandHint")} onDone={next} onBack={back}>
            <Pair names={["siteTitleEn", "siteTitleZh"]} values={[setup.siteTitleEn, setup.siteTitleZh]} max={120} />
          </SimpleStep>
        )}
        {step === "hometext" && (
          <SimpleStep action={setupUpdateHomeText} hint={t("hometextHint")} onDone={next} onBack={back}>
            <Pair names={["homeTitleEn", "homeTitleZh"]} values={[setup.homeTitleEn, setup.homeTitleZh]} max={200} />
            <Pair names={["homeSubtitleEn", "homeSubtitleZh"]} values={[setup.homeSubtitleEn, setup.homeSubtitleZh]} max={300} />
          </SimpleStep>
        )}
        {step === "features" && (
          <SimpleStep action={setupUpdateFeatures} hint={t("featuresStepHint")} onDone={next} onBack={back}>
            <Features setup={setup} />
          </SimpleStep>
        )}
        {step === "finish" && (
          <form action={completeSetup} className="grid gap-4">
            <input type="hidden" name="site" value="3d" />
            <p className="text-sm text-fg-muted">{t("finishHint")}</p>
            <p className="text-xs text-fg-subtle">{ta("studioSetupLater")}</p>
            <Nav onBack={back} label={ta("studioSetupFinish")} />
          </form>
        )}
      </section>
      <form action={logout3d} className="mt-6">
        <button type="submit" className="text-xs text-fg-subtle underline-offset-4 hover:text-fg hover:underline">
          {t("logOutInstead")}
        </button>
      </form>
    </BookingPanel>
  );
}

function Nav({ onBack, label, pending }: { onBack?: () => void; label?: string; pending?: boolean }) {
  const tc = useTranslations("common");
  return (
    <div className="flex flex-wrap-reverse items-center justify-between gap-3 pt-1">
      {onBack ? (
        <button type="button" onClick={onBack} disabled={pending} className={secondaryClass}>
          <span aria-hidden="true">←</span> {tc("back")}
        </button>
      ) : (
        <span />
      )}
      <button type="submit" disabled={pending} className={primaryClass}>
        {label ?? tc("next")}
        <span aria-hidden="true" className="text-lg">→</span>
      </button>
    </div>
  );
}

/** English and Chinese fields side by side, labelled as on Site settings. */
function Pair({ names, values, max }: { names: [string, string]; values: [string, string]; max: number }) {
  const ts = useTranslations("adminSite");
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {names.map((name, i) => (
        <label key={name} className={labelClass}>
          {ts(name)}
          <input name={name} defaultValue={values[i]} maxLength={max} className={fieldClass} />
        </label>
      ))}
    </div>
  );
}

/** A step whose action only answers ok: on to the next one when it does. */
function SimpleStep({
  action,
  hint,
  onDone,
  onBack,
  children
}: {
  action: (state: { ok?: boolean }, data: FormData) => Promise<{ ok?: boolean }>;
  hint: string;
  onDone: () => void;
  onBack?: () => void;
  children: ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    <form action={formAction} aria-busy={pending} className="grid gap-4">
      <p className="text-sm text-fg-muted">{hint}</p>
      {children}
      <Nav onBack={onBack} pending={pending} />
    </form>
  );
}

function Features({ setup }: { setup: StudioSetup }) {
  const t = useTranslations("setup");
  const ts = useTranslations("adminSite");
  const [booking, setBooking] = useState(setup.bookingEnabled);
  const rows = [
    ["bookingEnabled", ts("bookingEnabledLabel"), t("bookingPreview"), setup.bookingEnabled],
    ["lotteryEnabled", ts("lotteryEnabledLabel"), t("lotteryPreview"), setup.lotteryEnabled],
    ["creditProfilesEnabled", ts("creditProfilesEnabledLabel", { term: setup.creditTerm }), t("creditProfilesPreview", { term: setup.creditTerm }), setup.creditProfilesEnabled]
  ] as const;
  return (
    <div className="grid gap-2">
      {rows.map(([name, label, hint, on]) => (
        <label key={name} className="flex items-start gap-3 border border-border-strong p-3 text-sm has-[:checked]:border-fg has-[:disabled]:opacity-50">
          <input
            type="checkbox"
            name={name}
            defaultChecked={on}
            disabled={name === "lotteryEnabled" && !booking}
            onChange={name === "bookingEnabled" ? (e) => setBooking(e.target.checked) : undefined}
            className={`mt-0.5 ${checkClass}`}
          />
          <span className="grid gap-1">
            <span className="font-semibold">{label}</span>
            <span className="text-xs leading-5 text-fg-subtle">{hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function CredentialsStep({ username, onDone }: { username: string; onDone: () => void }) {
  const t = useTranslations("setup");
  const [state, formAction, pending] = useActionState<CredentialsState, FormData>(setupUpdateCredentials, {});
  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);
  const error =
    state.error === "mismatch"
      ? t("credentialsMismatch")
      : state.error === "validation"
        ? t("credentialsInvalid")
        : state.error === "unknown"
          ? t("credentialsUnknown")
          : state.error
            ? t(`credentials_${state.error}`)
            : null;
  const fields = [
    ["username", t("username"), "text", "username", username],
    ["currentPassword", t("currentPassword"), "password", "current-password", ""],
    ["password", t("newPassword"), "password", "new-password", ""],
    ["confirmPassword", t("confirmPassword"), "password", "new-password", ""]
  ] as const;
  return (
    <form action={formAction} aria-busy={pending} className="grid gap-4">
      <p className="text-sm text-fg-muted">{t("credentialsHint")}</p>
      {fields.map(([name, label, type, autoComplete, value]) => (
        <label key={name} className={labelClass}>
          {label}
          <input
            name={name}
            type={type}
            autoComplete={autoComplete}
            defaultValue={value}
            required
            minLength={name === "password" || name === "confirmPassword" ? 8 : undefined}
            maxLength={name === "username" ? 40 : 72}
            className={fieldClass}
          />
        </label>
      ))}
      {error && <FormNote tone="error">{error}</FormNote>}
      <Nav pending={pending} />
    </form>
  );
}
