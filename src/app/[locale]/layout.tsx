import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import {
  getMessages,
  getTranslations,
  setRequestLocale
} from "next-intl/server";
import { routing } from "@/i18n/routing";
import "../globals.css";

/**
 * Platform-wide default title. This layout wraps every route — the directory,
 * the login page, the dashboard — so it must NOT assume an owner: there is no
 * single site owner any more, and a page under /u/<username> overrides this
 * with that photographer's own title.
 *
 * It must also never depend on an owner existing at all: on a fresh deployment
 * no account exists until someone logs in, and failing here would hide the
 * login page and leave no way to ever create one.
 */
export async function generateMetadata({
  params
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("siteName") };
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
