import type { CSSProperties } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import type { User } from "@prisma/client";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import MobileNav from "@/components/MobileNav";
import ThemeToggle from "@/components/ThemeToggle";
import ScrollBlurBackground from "@/components/ScrollBlurBackground";
import ContactUsButton from "@/components/ContactUsButton";
import { getCurrentUser } from "@/lib/auth";
import {
  getSiteSettings,
  resolveContactQrToken,
  resolveContactTitle,
  resolveContactUrl,
  resolveSiteTitle
} from "@/lib/settings";
import { siteImageUrl } from "@/lib/images";
import { ownerBasePath } from "@/lib/owner";

/**
 * The public header/background/footer for ONE owner's site.
 *
 * A component rather than a layout because the four routes that need it each
 * learn their owner a different way: /u/<username> from the path, and
 * /book/<token>, /draw/<token>, /my-booking/<token> from their token. They all
 * pass the owner in here, which is why a visitor following a booking link sees
 * that photographer's branding rather than whoever happens to be first in the
 * database.
 */
export default async function SiteChrome({
  owner,
  children
}: {
  owner: User;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  const locale = await getLocale();
  const [settings, currentUser] = await Promise.all([
    getSiteSettings(owner.id),
    getCurrentUser()
  ]);
  const base = ownerBasePath(owner.username);
  const accountHref = currentUser ? "/dashboard" : "/login";
  const accountLabel = currentUser
    ? t("nav.profileManagement")
    : t("nav.photographerLogin");

  const siteTitle = resolveSiteTitle(settings, locale, t("common.siteName"));
  const bgImage = siteImageUrl(settings.backgroundImage);
  const logoUrl = siteImageUrl(settings.logo);
  const contactUrl = resolveContactUrl(settings, locale);
  const contactQrUrl = siteImageUrl(resolveContactQrToken(settings, locale));
  const showContact = settings.contactEnabled && (contactUrl || contactQrUrl);
  const contactTitle = resolveContactTitle(settings, locale, t("nav.contact"));
  const contactLabels = {
    button: t("nav.contact"),
    close: t("common.close"),
    visitLink: t("nav.contactVisitLink")
  };

  // Owner-customizable background: a color and/or a full-page image, scoped to
  // the public site so admin screens keep their standard look. Rendered via
  // ScrollBlurBackground (a separate fixed layer) rather than inline on this
  // wrapper, so its scroll-driven blur never affects the header/main/footer
  // sitting on top of it.
  const style: CSSProperties = {};
  if (settings.backgroundColor) style.backgroundColor = settings.backgroundColor;
  if (bgImage) {
    style.backgroundImage = `url(${bgImage})`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
  }

  return (
    <div className="flex min-h-screen flex-col">
      <ScrollBlurBackground style={style} />
      <header className="sticky top-0 z-40 border-b border-fg/10 bg-page/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3">
          <Link
            href={base}
            className="flex items-center gap-2 text-lg font-semibold tracking-wide"
          >
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-8 w-auto" />
            )}
            {siteTitle}
          </Link>
          <nav className="hidden items-center gap-4 text-sm sm:flex sm:gap-5">
            <Link href={`${base}/gallery`} className="text-fg-muted hover:text-fg">
              {t("nav.gallery")}
            </Link>
            {settings.bookingEnabled && (
              <Link href={`${base}/booking`} className="text-fg-muted hover:text-fg">
                {t("nav.booking")}
              </Link>
            )}
            <LanguageSwitcher />
            <ThemeToggle label={t("common.toggleTheme")} />
            {showContact && (
              <ContactUsButton
                title={contactTitle}
                url={contactUrl}
                qrUrl={contactQrUrl}
                labels={contactLabels}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-fg-muted transition hover:border-fg-faint hover:text-fg"
              />
            )}
            <Link
              href={accountHref}
              className="rounded-lg border border-border-strong px-3 py-1.5 text-fg-muted transition hover:border-fg-faint hover:text-fg"
            >
              {accountLabel}
            </Link>
          </nav>
          <MobileNav
            basePath={base}
            labels={{
              gallery: t("nav.gallery"),
              booking: t("nav.booking"),
              account: accountLabel,
              menu: t("nav.menu"),
              toggleTheme: t("common.toggleTheme"),
              contact: t("nav.contact")
            }}
            accountHref={accountHref}
            showBooking={settings.bookingEnabled}
            showContact={!!showContact}
            contact={
              showContact
                ? {
                    title: contactTitle,
                    url: contactUrl,
                    qrUrl: contactQrUrl,
                    labels: contactLabels
                  }
                : undefined
            }
          />
        </div>
      </header>
      <main className="mx-auto my-4 w-full max-w-[1600px] flex-1 px-4 sm:my-8 sm:px-6">
        {children}
      </main>
      <footer className="flex flex-col items-center justify-center gap-2 border-t border-fg/10 bg-page/70 py-6 text-center text-xs text-fg-subtle backdrop-blur-xl sm:flex-row sm:gap-4">
        <span>
          © {new Date().getFullYear()} {siteTitle}
        </span>
        {showContact && (
          <ContactUsButton
            title={contactTitle}
            url={contactUrl}
            qrUrl={contactQrUrl}
            labels={contactLabels}
            className="text-fg-muted underline decoration-fg/30 underline-offset-2 transition hover:text-fg"
          />
        )}
      </footer>
    </div>
  );
}
