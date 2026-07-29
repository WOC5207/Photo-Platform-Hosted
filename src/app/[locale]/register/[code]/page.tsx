import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser, homePathFor } from "@/lib/auth";
import { pickText } from "@/lib/content";
import { getPlatformSettings } from "@/lib/platformSettings";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import RegisterForm from "./RegisterForm";
import RegistrationGate from "./RegistrationGate";

// Reads the invite and the session cookie — never prerender.
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false
  }
};

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

  const [invite, platformSettings] = await Promise.all([
    prisma.invite.findUnique({
      where: { code },
      select: { redeemedAt: true, expiresAt: true }
    }),
    getPlatformSettings()
  ]);
  // The form is only rendered for an invite that could actually be redeemed.
  // Whether it holds is re-checked under a lock when the form is submitted —
  // this is presentation, not enforcement.
  const usable =
    invite &&
    !invite.redeemedAt &&
    (!invite.expiresAt || invite.expiresAt > new Date());

  const registrationForm = (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t("title")}</h1>
        <p className="text-sm text-fg-subtle">{t("subtitle")}</p>
      </div>
      <RegisterForm
        code={code}
        consentRequired={
          platformSettings.registrationNoticeEnabled &&
          platformSettings.registrationNoticeMode === "consent"
        }
        noticeVersion={platformSettings.registrationNoticeVersion}
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
          errorUsernameUppercase: t("errorUsernameUppercase"),
          errorBadInvite: t("errorBadInvite"),
          errorRateLimited: t("errorRateLimited"),
          errorNoticeChanged: t("errorNoticeChanged"),
          errorConsentRequired: t("errorConsentRequired"),
          consentLabel: t("consentLabel")
        }}
      />
    </div>
  );

  const noticeTitle =
    pickText(
      locale,
      platformSettings.registrationNoticeTitleEn,
      platformSettings.registrationNoticeTitleZh
    ) || t("noticeDefaultTitle");
  const noticeBody =
    pickText(
      locale,
      platformSettings.registrationNoticeBodyEn,
      platformSettings.registrationNoticeBodyZh
    ) || t("noticeDefaultBody");

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center gap-6 px-4 py-10">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>

      {!usable ? (
        <div className="mx-auto flex w-full max-w-md flex-col gap-2 rounded-2xl border border-border p-6 text-center">
          <h1 className="text-xl font-semibold">{t("invalidInvite")}</h1>
          <p className="text-sm text-fg-subtle">{t("invalidInviteHint")}</p>
        </div>
      ) : (
        platformSettings.registrationNoticeEnabled ? (
          <RegistrationGate
            delaySeconds={platformSettings.registrationNoticeDelaySeconds}
            noticeTitle={noticeTitle}
            noticeBody={noticeBody}
            labels={{
              noticeLabel: t("noticeLabel"),
              waitLabel: t("noticeWaitLabel"),
              secondsShort: t("noticeSecondsShort"),
              ready: t("noticeReady"),
              continue: t("noticeContinue")
            }}
          >
            {registrationForm}
          </RegistrationGate>
        ) : (
          registrationForm
        )
      )}
    </div>
  );
}
