"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import {
  updateSiteSettings,
  type SiteSettingsState
} from "@/app/[locale]/admin/(protected)/settings/actions";

const inputCls =
  "rounded-lg border border-border-strong bg-surface px-3 py-2 text-fg outline-none focus:border-fg-subtle";

const THEME_DEFAULT_COLOR = "#0a0a0a";

// All the text/checkbox fields below submit through this single form even
// though most of them aren't its DOM descendants (the `form` attribute
// associates them by id) — that's what lets each field group sit directly
// next to the standalone, independently-saving widget for the same part of
// the site (logo, background image, QR code, personal links, contact
// methods) without nesting a <form> inside a <form>, which HTML disallows.
export const FORM_ID = "site-settings-form";

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
    <section className="flex flex-col gap-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-xs text-fg-subtle">{hint}</p>
      </div>
      {children}
    </section>
  );
}

export default function SiteSettingsForm({
  initial,
  creditTerm,
  logoSlot,
  backgroundImageSlot,
  personalLinksSlot,
  announcementsSlot,
  contactQrEnSlot,
  contactQrZhSlot,
  contactMethodsSlot
}: {
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
    contactEnabled: boolean;
    contactTitleEn: string;
    contactTitleZh: string;
    contactUrlEn: string;
    contactUrlZh: string;
  };
  // Resolved display term (e.g. "Cosplayer"), used to phrase the credit
  // profiles feature toggle in the site's own configured vocabulary.
  creditTerm: string;
  // Standalone, independently-saving widgets rendered by the settings page,
  // slotted into the group they belong to so related settings sit together.
  logoSlot: ReactNode;
  backgroundImageSlot: ReactNode;
  personalLinksSlot: ReactNode;
  announcementsSlot: ReactNode;
  contactQrEnSlot: ReactNode;
  contactQrZhSlot: ReactNode;
  contactMethodsSlot: ReactNode;
}) {
  const t = useTranslations("adminSite");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState<
    SiteSettingsState,
    FormData
  >(updateSiteSettings, {});

  const [color, setColor] = useState(initial.backgroundColor);

  return (
    <div className="flex flex-col gap-8">
      <form id={FORM_ID} action={formAction} className="sr-only" />

      {/* Header: shown at the top of every public page */}
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
        {logoSlot}
      </Group>

      {/* Background: shown behind every public page */}
      <Group title={t("groupBackgroundTitle")} hint={t("groupBackgroundHint")}>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-fg-muted">
            {t("backgroundColorSection")}
          </span>
          <p className="text-xs text-fg-subtle">{t("backgroundColorHint")}</p>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="color"
              aria-label={t("backgroundColorSection")}
              value={color || THEME_DEFAULT_COLOR}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded-md border border-border-strong bg-surface"
            />
            <span className="font-mono text-sm text-fg-muted">
              {color || t("colorDefault")}
            </span>
            {color && (
              <button
                type="button"
                onClick={() => setColor("")}
                className="rounded-md border border-border-strong px-2 py-1 text-xs text-fg-muted transition hover:border-fg-faint hover:text-fg"
              >
                {t("resetColor")}
              </button>
            )}
            <input
              form={FORM_ID}
              type="hidden"
              name="backgroundColor"
              value={color}
            />
          </div>
        </div>
        {backgroundImageSlot}
      </Group>

      {/* Homepage: hero text and sidebar */}
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
        {personalLinksSlot}
        {announcementsSlot}
      </Group>

      {/* Contact us: header + footer button and modal */}
      <Group title={t("contactSection")} hint={t("contactHint")}>
        <label className="flex items-center gap-2 text-sm">
          <input
            form={FORM_ID}
            type="checkbox"
            name="contactEnabled"
            defaultChecked={initial.contactEnabled}
            className="h-4 w-4 accent-fg"
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
            {contactQrEnSlot}
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
            {contactQrZhSlot}
          </div>
        </div>
      </Group>

      {/* Booking: photoshoot booking page */}
      <Group title={t("groupBookingTitle")} hint={t("groupBookingHint")}>
        <label className="flex items-center gap-2 text-sm">
          <input
            form={FORM_ID}
            type="checkbox"
            name="bookingEnabled"
            defaultChecked={initial.bookingEnabled}
            className="h-4 w-4 accent-fg"
          />
          <span>{t("bookingEnabledLabel")}</span>
        </label>
        {contactMethodsSlot}
      </Group>

      {/* Lottery: lottery draw page */}
      <Group title={t("groupLotteryTitle")} hint={t("groupLotteryHint")}>
        <label className="flex items-center gap-2 text-sm">
          <input
            form={FORM_ID}
            type="checkbox"
            name="lotteryEnabled"
            defaultChecked={initial.lotteryEnabled}
            className="h-4 w-4 accent-fg"
          />
          <span>{t("lotteryEnabledLabel")}</span>
        </label>
      </Group>

      {/* Credits: photo-credit vocabulary and profile management */}
      <Group title={t("groupCreditsTitle")} hint={t("groupCreditsHint")}>
        <label className="flex items-center gap-2 text-sm">
          <input
            form={FORM_ID}
            type="checkbox"
            name="creditProfilesEnabled"
            defaultChecked={initial.creditProfilesEnabled}
            className="h-4 w-4 accent-fg"
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
        <p className="-mb-1 text-xs text-fg-subtle">{t("homeCreditsLabelHint")}</p>
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

      <div className="sticky bottom-4 flex flex-col items-start gap-2 border-t border-border bg-page/95 pt-4 backdrop-blur-xl">
        {state.error && (
          <p className="rounded-lg bg-danger-surface px-3 py-2 text-sm text-danger">
            {t("saveError")}
          </p>
        )}
        {state.ok && (
          <p className="rounded-lg bg-success-surface px-3 py-2 text-sm text-success">
            {tc("saved")}
          </p>
        )}
        <button
          type="submit"
          form={FORM_ID}
          disabled={pending}
          className="rounded-lg bg-fg px-5 py-2 text-sm font-semibold text-page transition hover:opacity-90 disabled:opacity-50"
        >
          {tc("save")}
        </button>
      </div>
    </div>
  );
}
