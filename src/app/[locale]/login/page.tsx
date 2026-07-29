import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

// Reads the session cookie — never prerender.
export const dynamic = "force-dynamic";
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

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-16">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <main className="w-full max-w-md rounded-xl border border-border bg-surface p-6 sm:p-8">
        <span aria-hidden="true" className="font-meta text-[0.6875rem] font-semibold tracking-[0.18em] text-accent">
          01 / ACCESS
        </span>
        <h1 className="font-display mt-4 text-4xl font-semibold tracking-[-0.04em]">
          {t("loginTitle")}
        </h1>
        <div className="mt-8">
          <LoginForm />
        </div>
      </main>
    </div>
  );
}
