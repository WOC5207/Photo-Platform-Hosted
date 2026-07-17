"use client";

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode
} from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import SectionHeading from "@/components/ui/SectionHeading";
import StatusMessage from "@/components/ui/StatusMessage";
import Tabs from "@/components/ui/Tabs";
import {
  updateSiteSettings,
  type SiteSettingsSection,
  type SiteSettingsState
} from "@/app/[locale]/dashboard/(protected)/settings/actions";

const inputCls =
  "h-10 rounded-lg border border-border-strong bg-surface px-3 text-sm text-fg outline-none transition focus:border-fg-subtle focus:ring-2 focus:ring-fg-faint/20";
const checkboxCls =
  "h-5 w-5 rounded border-border-strong accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 disabled:cursor-not-allowed disabled:opacity-50";

const THEME_DEFAULT_COLOR = "#0a0a0a";

// Independently-saving widgets contain their own forms, so the section form
// stays detached and fields opt into it with the `form` attribute.
const FORM_ID = "site-settings-form";

function Group({
  title,
  hint,
  children
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-4 sm:p-6">
      <SectionHeading title={title} description={hint} />
      {children}
    </section>
  );
}

function IndependentWidget({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p
        className="mb-2 w-fit rounded-md bg-success-surface px-2 py-1 text-xs font-medium text-success"
        role="status"
      >
        {label}
      </p>
      {children}
    </div>
  );
}

export default function SiteSettingsForm({
  activeSection,
  initial,
  creditTerm,
  logoSlot,
  backgroundImageSlot,
  personalLinksSlot,
  announcementsSlot,
  contactQrEnSlot,
  contactQrZhSlot,
  contactMethodsSlot,
  profileSlot
}: {
  activeSection: SiteSettingsSection | "profile";
  initial: {
    siteTitleEn: string;
    siteTitleZh: string;
    homeTitleEn: string;
    homeTitleZh: string;
    homeSubtitleEn: string;
    homeSubtitleZh: string;
    backgroundColor: string;
    creditTermEn: string;
    creditTermZh: string;
    subjectTermEn: string;
    subjectTermZh: string;
    homeCreditsLabelEn: string;
    homeCreditsLabelZh: string;
    bookingEnabled: boolean;
    lotteryEnabled: boolean;
    creditProfilesEnabled: boolean;
    announcementsEnabled: boolean;
    contactEnabled: boolean;
    contactTitleEn: string;
    contactTitleZh: string;
    contactUrlEn: string;
    contactUrlZh: string;
  };
  creditTerm: string;
  logoSlot: ReactNode;
  backgroundImageSlot: ReactNode;
  personalLinksSlot: ReactNode;
  announcementsSlot: ReactNode;
  contactQrEnSlot: ReactNode;
  contactQrZhSlot: ReactNode;
  contactMethodsSlot: ReactNode;
  profileSlot: ReactNode;
}) {
  const t = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    SiteSettingsState,
    FormData
  >(updateSiteSettings, {});
  const [dirty, setDirty] = useState(false);
  const changeVersion = useRef(0);
  const submittedVersion = useRef(0);
  const [color, setColor] = useState(initial.backgroundColor);
  const [bookingEnabled, setBookingEnabled] = useState(initial.bookingEnabled);
  const [lotteryEnabled, setLotteryEnabled] = useState(
    initial.bookingEnabled && initial.lotteryEnabled
  );

  useEffect(() => {
    if (state.ok && submittedVersion.current === changeVersion.current) {
      setDirty(false);
    }
  }, [state]);

  function markDirty() {
    changeVersion.current += 1;
    setDirty(true);
  }

  function handleSettingsChange(event: FormEvent<HTMLDivElement>) {
    const target = event.target;
    if (
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement) &&
      target.form?.id === FORM_ID
    ) {
      markDirty();
    }
  }

  const sections: Array<{ id: SiteSettingsSection | "profile"; label: string }> = [
    { id: "appearance", label: t("settingsTabAppearance") },
    { id: "homepage", label: t("settingsTabHomepage") },
    { id: "contact", label: t("settingsTabContact") },
    { id: "features", label: t("settingsTabFeatures") },
    { id: "profile", label: t("settingsTabProfile") }
  ];

  return (
    <div className="flex flex-col gap-6" onChangeCapture={handleSettingsChange}>
      <Tabs
        active={activeSection}
        label={t("title")}
        items={sections.map((section) => ({
          ...section,
          href: `/dashboard/settings?section=${section.id}`
        }))}
      />

      <form
        id={FORM_ID}
        action={formAction}
        onSubmit={() => {
          submittedVersion.current = changeVersion.current;
        }}
        className="hidden"
      >
        <input type="hidden" name="section" value={activeSection} />
      </form>

      {activeSection === "appearance" && (
        <div className="flex flex-col gap-6">
          <Group title={t("groupHeaderTitle")} hint={t("groupHeaderHint")}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("siteTitleEn")}</span>
                <input
                  form={FORM_ID}
                  name="siteTitleEn"
                  defaultValue={initial.siteTitleEn}
                  maxLength={120}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("siteTitleZh")}</span>
                <input
                  form={FORM_ID}
                  name="siteTitleZh"
                  defaultValue={initial.siteTitleZh}
                  maxLength={120}
                  className={inputCls}
                />
              </label>
            </div>
            <IndependentWidget label={t("savedAutomatically")}>
              {logoSlot}
            </IndependentWidget>
          </Group>

          <Group
            title={t("groupBackgroundTitle")}
            hint={t("groupBackgroundHint")}
          >
            <div className="flex flex-col gap-1">
              <span className="text-sm text-fg-muted">
                {t("backgroundColorSection")}
              </span>
              <p className="text-xs text-fg-subtle">
                {t("backgroundColorHint")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  type="color"
                  aria-label={t("backgroundColorSection")}
                  value={color || THEME_DEFAULT_COLOR}
                  onChange={(event) => {
                    setColor(event.target.value);
                    markDirty();
                  }}
                  className="h-10 w-14 cursor-pointer rounded-md border border-border-strong bg-surface"
                />
                <span className="font-mono text-sm text-fg-muted">
                  {color || t("colorDefault")}
                </span>
                {color && (
                  <Button
                    type="button"
                    onClick={() => {
                      setColor("");
                      markDirty();
                    }}
                  >
                    {t("resetColor")}
                  </Button>
                )}
                <input
                  form={FORM_ID}
                  type="hidden"
                  name="backgroundColor"
                  value={color}
                />
              </div>
            </div>
            <IndependentWidget label={t("savedAutomatically")}>
              {backgroundImageSlot}
            </IndependentWidget>
          </Group>
        </div>
      )}

      {activeSection === "homepage" && (
        <Group title={t("groupHomepageTitle")} hint={t("groupHomepageHint")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("homeTitleEn")}</span>
              <input
                form={FORM_ID}
                name="homeTitleEn"
                defaultValue={initial.homeTitleEn}
                maxLength={200}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("homeTitleZh")}</span>
              <input
                form={FORM_ID}
                name="homeTitleZh"
                defaultValue={initial.homeTitleZh}
                maxLength={200}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("homeSubtitleEn")}</span>
              <input
                form={FORM_ID}
                name="homeSubtitleEn"
                defaultValue={initial.homeSubtitleEn}
                maxLength={300}
                className={inputCls}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-fg-muted">{t("homeSubtitleZh")}</span>
              <input
                form={FORM_ID}
                name="homeSubtitleZh"
                defaultValue={initial.homeSubtitleZh}
                maxLength={300}
                className={inputCls}
              />
            </label>
          </div>
          <IndependentWidget label={t("savedAutomatically")}>
            {personalLinksSlot}
          </IndependentWidget>
          <div className="border-t border-border pt-6">
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                form={FORM_ID}
                type="checkbox"
                name="announcementsEnabled"
                defaultChecked={initial.announcementsEnabled}
                className={checkboxCls}
              />
              <span>{t("announcementsEnabledLabel")}</span>
            </label>
            <IndependentWidget label={t("savedAutomatically")}>
              {announcementsSlot}
            </IndependentWidget>
          </div>
        </Group>
      )}

      {activeSection === "contact" && (
        <Group title={t("contactSection")} hint={t("contactHint")}>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              form={FORM_ID}
              type="checkbox"
              name="contactEnabled"
              defaultChecked={initial.contactEnabled}
              className={checkboxCls}
            />
            <span>{t("contactEnabledLabel")}</span>
          </label>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-fg-muted">English</h3>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("contactTitleEn")}</span>
                <input
                  form={FORM_ID}
                  name="contactTitleEn"
                  defaultValue={initial.contactTitleEn}
                  maxLength={120}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("contactUrlEn")}</span>
                <input
                  form={FORM_ID}
                  name="contactUrlEn"
                  type="url"
                  defaultValue={initial.contactUrlEn}
                  maxLength={500}
                  placeholder="https://…"
                  className={inputCls}
                />
              </label>
              <IndependentWidget label={t("savedAutomatically")}>
                {contactQrEnSlot}
              </IndependentWidget>
            </div>
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-fg-muted">中文</h3>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("contactTitleZh")}</span>
                <input
                  form={FORM_ID}
                  name="contactTitleZh"
                  defaultValue={initial.contactTitleZh}
                  maxLength={120}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("contactUrlZh")}</span>
                <input
                  form={FORM_ID}
                  name="contactUrlZh"
                  type="url"
                  defaultValue={initial.contactUrlZh}
                  maxLength={500}
                  placeholder="https://…"
                  className={inputCls}
                />
              </label>
              <IndependentWidget label={t("savedAutomatically")}>
                {contactQrZhSlot}
              </IndependentWidget>
            </div>
          </div>
        </Group>
      )}

      {activeSection === "features" && (
        <div className="flex flex-col gap-6">
          <Group title={t("groupBookingTitle")} hint={t("groupBookingHint")}>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                form={FORM_ID}
                type="checkbox"
                name="bookingEnabled"
                checked={bookingEnabled}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setBookingEnabled(enabled);
                  if (!enabled) setLotteryEnabled(false);
                }}
                className={checkboxCls}
              />
              <span>{t("bookingEnabledLabel")}</span>
            </label>

            <div className="ml-2 rounded-r-xl border-l-2 border-border-strong bg-page/60 p-4 sm:ml-4">
              <h3 className="text-base font-semibold">{t("groupLotteryTitle")}</h3>
              <p className="mt-1 text-xs text-fg-subtle">
                {t("groupLotteryHint")}
              </p>
              <label className="mt-3 flex min-h-11 items-center gap-2 text-sm">
                <input
                  form={FORM_ID}
                  type="checkbox"
                  name="lotteryEnabled"
                  checked={bookingEnabled && lotteryEnabled}
                  disabled={!bookingEnabled}
                  onChange={(event) => setLotteryEnabled(event.target.checked)}
                  aria-describedby={
                    bookingEnabled ? undefined : "lottery-booking-dependency"
                  }
                  className={checkboxCls}
                />
                <span className={!bookingEnabled ? "text-fg-subtle" : undefined}>
                  {t("lotteryEnabledLabel")}
                </span>
              </label>
              {!bookingEnabled && (
                <p
                  id="lottery-booking-dependency"
                  className="text-xs text-fg-subtle"
                >
                  {t("lotteryRequiresBooking")}
                </p>
              )}
            </div>

            <IndependentWidget label={t("savedAutomatically")}>
              {contactMethodsSlot}
            </IndependentWidget>
          </Group>

          <Group title={t("groupCreditsTitle")} hint={t("groupCreditsHint")}>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                form={FORM_ID}
                type="checkbox"
                name="creditProfilesEnabled"
                defaultChecked={initial.creditProfilesEnabled}
                className={checkboxCls}
              />
              <span>{t("creditProfilesEnabledLabel", { term: creditTerm })}</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("creditTermEn")}</span>
                <input
                  form={FORM_ID}
                  name="creditTermEn"
                  defaultValue={initial.creditTermEn}
                  maxLength={60}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("creditTermZh")}</span>
                <input
                  form={FORM_ID}
                  name="creditTermZh"
                  defaultValue={initial.creditTermZh}
                  maxLength={60}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("subjectTermEn")}</span>
                <input
                  form={FORM_ID}
                  name="subjectTermEn"
                  defaultValue={initial.subjectTermEn}
                  maxLength={60}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("subjectTermZh")}</span>
                <input
                  form={FORM_ID}
                  name="subjectTermZh"
                  defaultValue={initial.subjectTermZh}
                  maxLength={60}
                  className={inputCls}
                />
              </label>
            </div>
            <p className="text-xs text-fg-subtle">
              {t("homeCreditsLabelHint")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("homeCreditsLabelEn")}</span>
                <input
                  form={FORM_ID}
                  name="homeCreditsLabelEn"
                  defaultValue={initial.homeCreditsLabelEn}
                  maxLength={60}
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-fg-muted">{t("homeCreditsLabelZh")}</span>
                <input
                  form={FORM_ID}
                  name="homeCreditsLabelZh"
                  defaultValue={initial.homeCreditsLabelZh}
                  maxLength={60}
                  className={inputCls}
                />
              </label>
            </div>
          </Group>
        </div>
      )}

      {activeSection === "profile" && profileSlot}

      {activeSection !== "profile" && (
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-page/95 p-3 shadow-lg backdrop-blur-xl">
        <Button
          type="submit"
          form={FORM_ID}
          disabled={pending || !dirty}
          variant="primary"
          className="px-5"
        >
          {tc("save")}
        </Button>
        {dirty && !pending && (
          <p className="text-sm text-fg-muted" role="status">
            {t("unsavedChanges")}
          </p>
        )}
        {state.error && (
          <StatusMessage kind="error">
            {t("saveError")}
          </StatusMessage>
        )}
        {state.ok && !dirty && (
          <StatusMessage kind="success">
            {tc("saved")}
          </StatusMessage>
        )}
      </div>
      )}
    </div>
  );
}
