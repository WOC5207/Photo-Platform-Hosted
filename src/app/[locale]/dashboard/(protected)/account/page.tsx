import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import ChangePasswordForm from "@/components/dashboard/ChangePasswordForm";
import ProfileForm from "@/components/dashboard/ProfileForm";

export const dynamic = "force-dynamic";

/**
 * Your own account: the things that are about you rather than about your site.
 * Site branding and features live in Site settings; profile identity and
 * password security live here.
 */
export default async function AccountPage() {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const t = await getTranslations("account");
  const tr = await getTranslations("register");
  const tc = await getTranslations("common");

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          {t("signedInAs", { username: user.username })}
        </p>
      </div>

      <ProfileForm
        username={user.username}
        initialDisplayName={user.displayName}
        initialEmail={user.email}
        labels={{
          title: tr("displayName"),
          hint: tr("displayNameHint"),
          username: tr("username"),
          displayName: tr("displayName"),
          email: t("email"),
          emailHint: t("emailHint"),
          save: tc("save"),
          saved: tc("saved"),
          error: tc("error")
        }}
      />

      <ChangePasswordForm
        labels={{
          title: t("changePasswordTitle"),
          hint: t("changePasswordHint"),
          current: t("currentPassword"),
          next: t("newPassword"),
          confirm: t("confirmPassword"),
          submit: t("changePassword"),
          ok: t("changed"),
          errorValidation: t("errorValidation"),
          errorMismatch: t("errorMismatch"),
          errorWrongCurrent: t("errorWrongCurrent"),
          errorRateLimited: t("errorRateLimited")
        }}
      />
    </div>
  );
}
