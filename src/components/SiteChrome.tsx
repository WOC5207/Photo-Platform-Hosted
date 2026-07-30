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
import { siteDualThemeStyle } from "@/lib/themeColor";

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
  if (bgImage) {
    style.backgroundImage = `url(${bgImage})`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
  }

  return (
    <div
      className="site-dual-theme relative isolate flex min-h-screen flex-col"
      style={siteDualThemeStyle(
        {
          backgroundColor: settings.backgroundColor,
          surfaceColor: settings.surfaceColor,
          fieldColor: settings.fieldColor,
          textColor: settings.textColor,
          themeColor: settings.themeColor
        },
        {
          backgroundColor: settings.darkBackgroundColor,
          surfaceColor: settings.darkSurfaceColor,
          fieldColor: settings.darkFieldColor,
          textColor: settings.darkTextColor,
          themeColor: settings.darkThemeColor
        }
      )}
    >
      <ScrollBlurBackground style={style} />
      <header className="sticky top-0 z-40 border-b border-border bg-page/82 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link
            href={base}
            className="font-display flex min-h-11 items-center gap-3 text-xl font-semibold tracking-[-0.025em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="h-8 w-auto" />
            )}
            {siteTitle}
          </Link>
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <Link
              href={`${base}/gallery`}
              className="inline-flex min-h-10 items-center rounded-lg px-3 font-semibold text-fg-muted transition hover:bg-accent-surface hover:text-fg"
            >
              {t("nav.gallery")}
            </Link>
            {settings.bookingEnabled && (
              <Link
                href={`${base}/booking`}
                className="inline-flex min-h-10 items-center rounded-lg px-3 font-semibold text-fg-muted transition hover:bg-accent-surface hover:text-fg"
              >
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
                className="inline-flex min-h-10 items-center rounded-lg px-3 font-semibold text-fg-muted transition hover:bg-accent-surface hover:text-fg"
              />
            )}
            <Link
              href={accountHref}
              className="inline-flex min-h-10 items-center rounded-lg border border-border-strong bg-raised px-3 font-semibold text-fg-muted transition hover:border-accent/30 hover:text-fg"
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
      <main className="relative z-10 mx-auto my-6 w-full max-w-[1600px] flex-1 px-4 sm:my-10 sm:px-6 lg:my-14">
        {children}
      </main>
      <footer className="font-meta relative z-10 flex flex-col items-center justify-center gap-2 border-t border-border bg-page/82 py-7 text-center text-[0.6875rem] tracking-[0.08em] text-fg-subtle backdrop-blur-xl sm:flex-row sm:gap-4">
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
