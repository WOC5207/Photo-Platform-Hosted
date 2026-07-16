import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import RegisterForm from "./RegisterForm";

// Reads the invite and the session cookie — never prerender.
export const dynamic = "force-dynamic";

/**
 * Invite redemption. There is no public signup form anywhere; an account can
 * only be created by holding one of these codes, which is the whole of the
 * platform's registration policy.
 */
export default async function RegisterPage({
  params
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  const t = await getTranslations("register");

  // Already signed in: creating a second account from here would silently
  // replace the current session, which is never what anyone means.
  const current = await getCurrentUser();
  if (current) redirect(homePathFor(current, locale));

  const invite = await prisma.invite.findUnique({
    where: { code },
    select: { redeemedAt: true, expiresAt: true }
  });
  // The form is only rendered for an invite that could actually be redeemed.
  // Whether it holds is re-checked under a lock when the form is submitted —
  // this is presentation, not enforcement.
  const usable =
    invite &&
    !invite.redeemedAt &&
    (!invite.expiresAt || invite.expiresAt > new Date());

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>

      {!usable ? (
        <div className="flex flex-col gap-2 rounded-2xl border border-border p-6 text-center">
          <h1 className="text-xl font-semibold">{t("invalidInvite")}</h1>
          <p className="text-sm text-fg-subtle">{t("invalidInviteHint")}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-sm text-fg-subtle">{t("subtitle")}</p>
          </div>
          <RegisterForm
            code={code}
            labels={{
              username: t("username"),
              usernameHint: t("usernameHint"),
              displayName: t("displayName"),
              displayNameHint: t("displayNameHint"),
              password: t("password"),
              confirmPassword: t("confirmPassword"),
              submit: t("submit"),
              errorValidation: t("errorValidation"),
              errorMismatch: t("errorMismatch"),
              errorUsernameTaken: t("errorUsernameTaken"),
              errorUsernameReserved: t("errorUsernameReserved"),
              errorUsernameInvalid: t("errorUsernameInvalid"),
              errorBadInvite: t("errorBadInvite"),
              errorRateLimited: t("errorRateLimited")
            }}
          />
        </>
      )}
    </div>
  );
}
