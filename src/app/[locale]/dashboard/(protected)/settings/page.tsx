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

export default async function SiteSettingsPage() {
  const t = await getTranslations("adminSite");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await requireUser(locale);

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
            announcementsEnabled={settings.announcementsEnabled}
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
      />
    </div>
  );
}
