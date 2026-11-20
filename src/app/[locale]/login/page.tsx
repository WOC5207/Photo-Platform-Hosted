import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

// Reads the session cookie — never prerender.
export const dynamic = "force-dynamic";
import { Link } from "@/i18n/navigation";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  // Any signed-in account, not just an admin: ordinary users get accounts from
  // the next phase on, and none of them should be shown a login form again.
  // Must route via homePathFor — sending a non-admin to /admin would bounce
  // them straight back here, forever.
  const current = await getCurrentUser();
  if (current) redirect(homePathFor(current, locale));
  const t = await getTranslations("auth");
  const tc = await getTranslations("common");

  return (
    <div className="flex min-h-dvh flex-col px-4 py-4">
      <header className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-fg-muted underline-offset-4 hover:text-fg hover:underline"
        >
          <span aria-hidden="true">←</span> {tc("back")}
        </Link>
        <LanguageSwitcher />
      </header>
      <div className="flex flex-1 items-center justify-center py-8">
        <main id="main-content" tabIndex={-1} className="w-full max-w-md rounded-xl border border-border bg-surface p-6 sm:p-8">
          <span aria-hidden="true" className="font-meta text-[0.6875rem] font-semibold tracking-[0.18em] text-accent">
            {t("accessKicker")}
          </span>
          <h1 className="font-display mt-4 text-4xl font-semibold tracking-[-0.04em]">
            {t("loginTitle")}
          </h1>
          <div className="mt-8">
            <LoginForm />
          </div>
          <p className="mt-6 border-t border-border pt-4 text-xs leading-5 text-fg-subtle">
            {t("inviteOnlyHint")}
          </p>
        </main>
      </div>
    </div>
  );
}
