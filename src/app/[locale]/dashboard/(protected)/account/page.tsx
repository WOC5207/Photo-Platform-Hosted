import { getLocale, getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import ChangePasswordForm from "@/components/dashboard/ChangePasswordForm";

export const dynamic = "force-dynamic";

/**
 * Your own account: the things that are about you rather than about your site.
 * Site branding and features live in Site settings; this is just the password
 * for now.
 */
export default async function AccountPage() {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const t = await getTranslations("account");

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">
          {t("signedInAs", { username: user.username })}
        </p>
      </div>

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
