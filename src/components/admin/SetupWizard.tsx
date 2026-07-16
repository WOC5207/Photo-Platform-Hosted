"use client";

import { useEffect, useState, useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  setupUpdateCredentials,
  setupUpdateBrand,
  setupUpdateHomeText,
  setupUpdateFeatures,
  completeSetup,
  type CredentialsState,
  type BrandState,
  type HomeTextState,
  type FeaturesState
} from "@/app/[locale]/admin/setup/actions";
import SiteImageUploader from "@/components/admin/SiteImageUploader";
import PersonalLinksManager, {
  type AdminPersonalLink
} from "@/components/admin/PersonalLinksManager";
import ContactMethodsManager, {
  type AdminContactMethod
} from "@/components/admin/ContactMethodsManager";

type StepId =
  | "credentials"
  | "brand"
  | "hometext"
  | "features"
  | "contact"
  | "logo"
  | "background"
  | "links"
  | "finish";

function computeSteps(bookingEnabled: boolean): StepId[] {
  const steps: StepId[] = ["credentials", "brand", "hometext", "features"];
  if (bookingEnabled) steps.push("contact");
  steps.push("logo", "background", "links", "finish");
  return steps;
}

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg outline-none focus:border-fg-subtle";
const primaryBtnCls =
  "rounded-lg bg-fg px-5 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50";
const secondaryBtnCls =
  "rounded-lg border border-border-strong px-4 py-2 text-sm text-fg-muted transition hover:border-fg-faint hover:text-fg";

interface WizardSettings {
  siteTitleEn: string;
  siteTitleZh: string;
  homeTitleEn: string;
  homeTitleZh: string;
  homeSubtitleEn: string;
  homeSubtitleZh: string;
  bookingEnabled: boolean;
  lotteryEnabled: boolean;
  creditProfilesEnabled: boolean;
}

export default function SetupWizard({
  initialUsername,
  settings,
  creditTerm,
  contactMethods,
  personalLinks,
  logoUrl,
  backgroundUrl
}: {
  initialUsername: string;
  settings: WizardSettings;
  // Resolved display term (e.g. "Cosplayer"), used to phrase the credit
  // profiles feature toggle in the site's own configured vocabulary.
  creditTerm: string;
  contactMethods: AdminContactMethod[];
  personalLinks: AdminPersonalLink[];
  logoUrl: string;
  backgroundUrl: string;
}) {
  const t = useTranslations("setup");
  // Derived straight from the live settings prop (Next refreshes it
  // automatically after each step's server action revalidates), not from a
  // separately-tracked copy — that would need manual resyncing and could
  // drift from what's actually saved.
  const steps = computeSteps(settings.bookingEnabled);
  const [stepIndex, setStepIndex] = useState(0);
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const goNext = () => setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  return (
    <div className="flex flex-col gap-6 rounded-2xl border border-fg/10 bg-page/85 p-6 sm:p-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
          {t("stepOf", { current: stepIndex + 1, total: steps.length })}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-fg transition-all"
            style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {step === "credentials" && (
        <CredentialsStep initialUsername={initialUsername} onDone={goNext} />
      )}
      {step === "brand" && <BrandStep initial={settings} onDone={goNext} onBack={goBack} />}
      {step === "hometext" && (
        <HomeTextStep initial={settings} onDone={goNext} onBack={goBack} />
      )}
      {step === "features" && (
        <FeaturesStep
          initial={settings}
          creditTerm={creditTerm}
          onDone={goNext}
          onBack={goBack}
        />
      )}
      {step === "contact" && (
        <ContactStep
          contactMethods={contactMethods}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step === "logo" && (
        <OptionalImageStep
          kind="logo"
          currentUrl={logoUrl}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step === "background" && (
        <OptionalImageStep
          kind="background"
          currentUrl={backgroundUrl}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step === "links" && (
        <LinksStep personalLinks={personalLinks} onNext={goNext} onBack={goBack} />
      )}
      {step === "finish" && <FinishStep onBack={goBack} />}
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  pending,
  nextLabel,
  nextDisabled
}: {
  onBack?: () => void;
  onNext?: () => void;
  pending?: boolean;
  nextLabel: string;
  nextDisabled?: boolean;
}) {
  const tc = useTranslations("common");
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <button type="button" onClick={onBack} className={secondaryBtnCls}>
          {tc("back")}
        </button>
      ) : (
        <span />
      )}
      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className={primaryBtnCls}
        >
          {nextLabel}
        </button>
      ) : (
        <button
          type="submit"
          disabled={pending || nextDisabled}
          className={primaryBtnCls}
        >
          {nextLabel}
        </button>
      )}
    </div>
  );
}

function CredentialsStep({
  initialUsername,
  onDone
}: {
  initialUsername: string;
  onDone: () => void;
}) {
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    CredentialsState,
    FormData
  >(setupUpdateCredentials, {});

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  const errorMessage =
    state.error === "mismatch"
      ? t("credentialsMismatch")
      : state.error === "validation"
        ? t("credentialsInvalid")
        : state.error === "unknown"
          ? t("credentialsUnknown")
          : null;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">{t("credentialsTitle")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("credentialsHint")}</p>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("username")}</span>
        <input
          name="username"
          defaultValue={initialUsername}
          autoComplete="username"
          required
          maxLength={200}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("newPassword")}</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={500}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-fg-muted">{t("confirmPassword")}</span>
        <input
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={500}
          className={inputCls}
        />
      </label>
      {errorMessage && (
        <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
          {errorMessage}
        </p>
      )}
      <StepNav pending={pending} nextLabel={tc("next")} />
    </form>
  );
}

function BrandStep({
  initial,
  onDone,
  onBack
}: {
  initial: Pick<WizardSettings, "siteTitleEn" | "siteTitleZh">;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("setup");
  const ts = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<BrandState, FormData>(
    setupUpdateBrand,
    {}
  );

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">{t("brandTitle")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("brandHint")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{ts("siteTitleEn")}</span>
          <input
            name="siteTitleEn"
            defaultValue={initial.siteTitleEn}
            maxLength={120}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{ts("siteTitleZh")}</span>
          <input
            name="siteTitleZh"
            defaultValue={initial.siteTitleZh}
            maxLength={120}
            className={inputCls}
          />
        </label>
      </div>
      <StepNav onBack={onBack} pending={pending} nextLabel={tc("next")} />
    </form>
  );
}

function HomeTextStep({
  initial,
  onDone,
  onBack
}: {
  initial: Pick<
    WizardSettings,
    "homeTitleEn" | "homeTitleZh" | "homeSubtitleEn" | "homeSubtitleZh"
  >;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("setup");
  const ts = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    HomeTextState,
    FormData
  >(setupUpdateHomeText, {});

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">{t("hometextTitle")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("hometextHint")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{ts("homeTitleEn")}</span>
          <input
            name="homeTitleEn"
            defaultValue={initial.homeTitleEn}
            maxLength={200}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{ts("homeTitleZh")}</span>
          <input
            name="homeTitleZh"
            defaultValue={initial.homeTitleZh}
            maxLength={200}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{ts("homeSubtitleEn")}</span>
          <input
            name="homeSubtitleEn"
            defaultValue={initial.homeSubtitleEn}
            maxLength={300}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-fg-muted">{ts("homeSubtitleZh")}</span>
          <input
            name="homeSubtitleZh"
            defaultValue={initial.homeSubtitleZh}
            maxLength={300}
            className={inputCls}
          />
        </label>
      </div>
      <StepNav onBack={onBack} pending={pending} nextLabel={tc("next")} />
    </form>
  );
}

function FeatureToggleCard({
  name,
  checked,
  onChange,
  label,
  preview,
  icon
}: {
  name: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  preview: string;
  icon: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
        checked ? "border-fg-subtle bg-surface" : "border-border bg-surface/50"
      }`}
    >
      <input
        type="checkbox"
        name={name}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-fg"
      />
      <span className="flex-1">
        <span className="flex items-center gap-2 font-semibold">
          <span aria-hidden>{icon}</span>
          {label}
        </span>
        <span className="mt-1 block text-xs text-fg-subtle">{preview}</span>
      </span>
    </label>
  );
}

function FeaturesStep({
  initial,
  creditTerm,
  onDone,
  onBack
}: {
  initial: Pick<
    WizardSettings,
    "bookingEnabled" | "lotteryEnabled" | "creditProfilesEnabled"
  >;
  creditTerm: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("setup");
  const ts = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [booking, setBooking] = useState(initial.bookingEnabled);
  const [lottery, setLottery] = useState(initial.lotteryEnabled);
  const [creditProfiles, setCreditProfiles] = useState(
    initial.creditProfilesEnabled
  );
  const [state, formAction, pending] = useActionState<
    FeaturesState,
    FormData
  >(setupUpdateFeatures, {});

  useEffect(() => {
    if (state.ok) onDone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ok]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">{t("featuresTitle")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("featuresStepHint")}</p>
      </div>

      <div className="flex flex-col gap-3">
        <FeatureToggleCard
          name="bookingEnabled"
          checked={booking}
          onChange={setBooking}
          label={ts("bookingEnabledLabel")}
          preview={t("bookingPreview")}
          icon="📅"
        />
        <FeatureToggleCard
          name="lotteryEnabled"
          checked={lottery}
          onChange={setLottery}
          label={ts("lotteryEnabledLabel")}
          preview={t("lotteryPreview")}
          icon="🎡"
        />
        <FeatureToggleCard
          name="creditProfilesEnabled"
          checked={creditProfiles}
          onChange={setCreditProfiles}
          label={ts("creditProfilesEnabledLabel", { term: creditTerm })}
          preview={t("creditProfilesPreview", { term: creditTerm })}
          icon="🪪"
        />
      </div>

      <StepNav onBack={onBack} pending={pending} nextLabel={tc("next")} />
    </form>
  );
}

function ContactStep({
  contactMethods,
  onNext,
  onBack
}: {
  contactMethods: AdminContactMethod[];
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">{t("contactTitle")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("contactHint")}</p>
      </div>
      <ContactMethodsManager methods={contactMethods} />
      {contactMethods.length === 0 && (
        <p className="text-xs text-danger">{t("contactRequiredError")}</p>
      )}
      <StepNav
        onBack={onBack}
        onNext={onNext}
        nextLabel={tc("next")}
        nextDisabled={contactMethods.length === 0}
      />
    </div>
  );
}

function OptionalImageStep({
  kind,
  currentUrl,
  onNext,
  onBack
}: {
  kind: "logo" | "background";
  currentUrl: string;
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">
          {kind === "logo" ? t("logoTitle") : t("backgroundTitle")}
        </h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("optionalStepHint")}</p>
      </div>
      <SiteImageUploader kind={kind} currentUrl={currentUrl} />
      <StepNav onBack={onBack} onNext={onNext} nextLabel={tc("next")} />
    </div>
  );
}

function LinksStep({
  personalLinks,
  onNext,
  onBack
}: {
  personalLinks: AdminPersonalLink[];
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">{t("linksTitle")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("optionalStepHint")}</p>
      </div>
      <PersonalLinksManager links={personalLinks} />
      <StepNav onBack={onBack} onNext={onNext} nextLabel={tc("next")} />
    </div>
  );
}

function FinishStep({ onBack }: { onBack: () => void }) {
  const t = useTranslations("setup");
  const tc = useTranslations("common");
  return (
    <form action={completeSetup} className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-bold">{t("finishTitle")}</h2>
        <p className="mt-1 text-sm text-fg-subtle">{t("finishHint")}</p>
      </div>
      <StepNav onBack={onBack} nextLabel={tc("finish")} />
    </form>
  );
}
