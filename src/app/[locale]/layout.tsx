import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale
} from "next-intl/server";
import { routing } from "@/i18n/routing";
import { getSiteSettings, resolveSiteTitle } from "@/lib/settings";
import { findSiteOwner } from "@/lib/owner";
import "../globals.css";

export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  // findSiteOwner, not getSiteOwner: this layout wraps the login page too, and
  // on a fresh deployment no admin exists until someone logs in. A 404 here
  // would hide the login page and make the site impossible to ever set up.
  const owner = await findSiteOwner();
  const settings = owner ? await getSiteSettings(owner.id) : null;
  return {
    title: settings
      ? resolveSiteTitle(settings, locale, t("siteName"))
      : t("siteName")
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale === "zh" ? "zh-Hans" : "en"} suppressHydrationWarning>
      <body className="min-h-screen bg-page text-fg antialiased">
        {/* Applies a saved theme override before first paint, so there's no
            flash of the wrong theme. Absent an override, the OS preference
            (handled purely in CSS via prefers-color-scheme) takes effect. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark"){document.documentElement.classList.add(t)}}catch(e){}})();`
          }}
        />
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
