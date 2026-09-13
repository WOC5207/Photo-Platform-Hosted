import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { pickText } from "@/lib/content";
import { cosplanTemplateUrl } from "@/lib/cosplanStorage";
import CosplanEditorLoader from "@/components/cosplan/CosplanEditorLoader";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import ThemeToggle from "@/components/ThemeToggle";
import { Link } from "@/i18n/navigation";
import { parseCosplanSlots } from "@/lib/cosplanTypes";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cosplan");
  return { title: t("pageTitle"), description: t("pageDescription") };
}

export default async function CosplanPage() {
  const [locale, t, tc, templates] = await Promise.all([
    getLocale(),
    getTranslations("cosplan"),
    getTranslations("common"),
    prisma.cosplanTemplate.findMany({ where: { published: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] })
  ]);
  const summaries = templates.map((template) => ({
    id: template.id,
    title: pickText(locale, template.titleEn, template.titleZh),
    titleEn: template.titleEn,
    titleZh: template.titleZh,
    assetToken: template.assetToken,
    imageUrl: cosplanTemplateUrl(template.assetToken),
    foregroundToken: template.foregroundToken,
    foregroundUrl: template.foregroundToken ? cosplanTemplateUrl(template.foregroundToken) : null,
    layoutVersion: template.layoutVersion,
    slots: parseCosplanSlots(template.slots, template.width, template.height),
    width: template.width,
    height: template.height
  }));

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-dvh w-full max-w-[1600px] flex-col gap-6 px-4 py-5 sm:px-7 sm:py-8">
      <header className="flex flex-col gap-5 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <span className="font-meta mt-1 text-[0.6875rem] font-semibold tracking-[0.18em] text-accent-text" aria-hidden="true">CP</span>
          <div><h1 className="font-display ui-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">{t("pageTitle")}</h1><p className="ui-pretty mt-2 max-w-3xl text-sm leading-6 text-fg-subtle">{t("pageDescription")}</p></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-fg-muted hover:bg-surface">{t("directory")}</Link>
          <LanguageSwitcher />
          <ThemeToggle label={tc("toggleTheme")} />
        </div>
      </header>
      {summaries.length ? <CosplanEditorLoader templates={summaries} /> : <div className="ui-panel flex min-h-[55dvh] flex-col items-center justify-center p-8 text-center"><span className="font-meta text-xs text-accent-text">00 / 00</span><h2 className="font-display mt-3 text-2xl font-semibold">{t("noTemplates")}</h2><p className="mt-2 max-w-lg text-sm text-fg-subtle">{t("noTemplatesHint")}</p></div>}
    </main>
  );
}
