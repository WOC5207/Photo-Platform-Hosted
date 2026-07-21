import { getTranslations, getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { siteImageUrl } from "@/lib/images";
import {
  getSiteSettings,
  getAnnouncements,
  getContactMethods,
  getPersonalLinks,
  resolveCreditTerm
} from "@/lib/settings";
import SiteSettingsForm from "@/components/admin/SiteSettingsForm";
import SiteImageUploader from "@/components/admin/SiteImageUploader";
import PersonalLinksManager from "@/components/admin/PersonalLinksManager";
import AnnouncementsManager from "@/components/admin/AnnouncementsManager";
import ContactMethodsManager from "@/components/admin/ContactMethodsManager";
import ProfileForm from "@/components/dashboard/ProfileForm";
import ChangePasswordForm from "@/components/dashboard/ChangePasswordForm";
import type { SiteSettingsSection } from "./actions";

type SettingsPageSection = SiteSettingsSection | "profile";

const SETTINGS_SECTIONS: SettingsPageSection[] = [
  "appearance",
  "homepage",
  "contact",
  "features",
  "profile"
];

function resolveSection(value: string | string[] | undefined): SettingsPageSection {
  return typeof value === "string" &&
    SETTINGS_SECTIONS.includes(value as SettingsPageSection)
    ? (value as SettingsPageSection)
    : "appearance";
}

export default async function SiteSettingsPage({
  searchParams
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const t = await getTranslations("adminSite");
  const tc = await getTranslations("common");
  const ta = await getTranslations("account");
  const tr = await getTranslations("register");
  const locale = await getLocale();
  const user = await requireUser(locale);
  const section = resolveSection((await searchParams).section);

  const settings = await getSiteSettings(user.id);
  const personalLinks = await getPersonalLinks(user.id);
  const announcements = await getAnnouncements(user.id);
  const contactMethods = await getContactMethods(user.id);
  const creditTerm = resolveCreditTerm(settings, locale, tc("creditTerm"));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-fg-subtle">{t("intro")}</p>
      </div>

      <SiteSettingsForm
        key={section}
        activeSection={section}
        initial={{
          siteTitleEn: settings.siteTitleEn,
          siteTitleZh: settings.siteTitleZh,
          homeTitleEn: settings.homeTitleEn,
          homeTitleZh: settings.homeTitleZh,
          homeSubtitleEn: settings.homeSubtitleEn,
          homeSubtitleZh: settings.homeSubtitleZh,
          backgroundColor: settings.backgroundColor,
          creditTermEn: settings.creditTermEn,
          creditTermZh: settings.creditTermZh,
          subjectTermEn: settings.subjectTermEn,
          subjectTermZh: settings.subjectTermZh,
          homeCreditsLabelEn: settings.homeCreditsLabelEn,
          homeCreditsLabelZh: settings.homeCreditsLabelZh,
          bookingEnabled: settings.bookingEnabled,
          lotteryEnabled: settings.lotteryEnabled,
          creditProfilesEnabled: settings.creditProfilesEnabled,
          announcementsEnabled: settings.announcementsEnabled,
          contactEnabled: settings.contactEnabled,
          contactTitleEn: settings.contactTitleEn,
          contactTitleZh: settings.contactTitleZh,
          contactUrlEn: settings.contactUrlEn,
          contactUrlZh: settings.contactUrlZh
        }}
        creditTerm={creditTerm}
        logoSlot={
          <SiteImageUploader kind="logo" currentUrl={siteImageUrl(settings.logo)} />
        }
        backgroundImageSlot={
          <SiteImageUploader
            kind="background"
            currentUrl={siteImageUrl(settings.backgroundImage)}
          />
        }
        personalLinksSlot={
          <PersonalLinksManager
            links={personalLinks.map((l) => ({
              id: l.id,
              labelEn: l.labelEn,
              labelZh: l.labelZh,
              url: l.url
            }))}
          />
        }
        announcementsSlot={
          <AnnouncementsManager
            announcements={announcements.map((a) => ({
              id: a.id,
              titleEn: a.titleEn,
              titleZh: a.titleZh,
              bodyEn: a.bodyEn,
              bodyZh: a.bodyZh,
              imageUrl: siteImageUrl(a.image)
            }))}
          />
        }
        contactQrEnSlot={
          <SiteImageUploader
            kind="contactQrEn"
            currentUrl={siteImageUrl(settings.contactQrImageEn)}
          />
        }
        contactQrZhSlot={
          <SiteImageUploader
            kind="contactQrZh"
            currentUrl={siteImageUrl(settings.contactQrImageZh)}
          />
        }
        contactMethodsSlot={
          <ContactMethodsManager
            methods={contactMethods.map((m) => ({
              id: m.id,
              labelEn: m.labelEn,
              labelZh: m.labelZh
            }))}
          />
        }
        profileSlot={
          <div className="flex max-w-2xl flex-col gap-6">
            <ProfileForm
              username={user.username}
              initialDisplayName={user.displayName}
              initialEmail={user.email}
              labels={{
                title: tr("displayName"),
                hint: tr("displayNameHint"),
                username: tr("username"),
                displayName: tr("displayName"),
                email: ta("email"),
                emailHint: ta("emailHint"),
                save: tc("save"),
                saved: tc("saved"),
                error: tc("error")
              }}
            />
            <ChangePasswordForm
              labels={{
                title: ta("changePasswordTitle"),
                hint: ta("changePasswordHint"),
                current: ta("currentPassword"),
                next: ta("newPassword"),
                confirm: ta("confirmPassword"),
                submit: ta("changePassword"),
                ok: ta("changed"),
                errorValidation: ta("errorValidation"),
                errorMismatch: ta("errorMismatch"),
                errorWrongCurrent: ta("errorWrongCurrent"),
                errorRateLimited: ta("errorRateLimited")
              }}
            />
          </div>
        }
      />
    </div>
  );
}
