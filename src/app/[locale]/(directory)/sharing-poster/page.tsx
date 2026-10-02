import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import PublicSharingPosterLoader from "@/components/sharing-posters/PublicSharingPosterLoader";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Link } from "@/i18n/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("publicSharingPoster");
  return { title: t("pageTitle"), description: t("pageDescription") };
}

/**
 * The sharing poster editor for anyone, signed in or not. Visitors bring their
 * own photographs, which stay in their browser; the server only serves the page.
 */
export default async function PublicSharingPosterPage() {
  const [t, tc] = await Promise.all([getTranslations("publicSharingPoster"), getTranslations("common")]);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-7 sm:py-8">
      <header className="flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="font-meta mt-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-accent-text" aria-hidden="true">SP</span>
          <div><h1 className="font-display ui-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{t("pageTitle")}</h1><p className="ui-pretty mt-2 max-w-3xl text-sm leading-6 text-fg-subtle">{t("pageDescription")}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-fg-muted hover:bg-surface">{t("directory")}</Link>
          <LanguageSwitcher />
          <ThemeToggle label={tc("toggleTheme")} />
        </div>
      </header>
      <PublicSharingPosterLoader />
    </main>
  );
}
