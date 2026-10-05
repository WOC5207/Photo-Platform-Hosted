"use client";

import { startTransition, useActionState, useMemo, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { changePassword, logoutEverywhere, updateProfile, type ChangePasswordState, type UpdateProfileState } from "@/app/[locale]/dashboard/(protected)/account/actions";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import type { BoardTile } from "../board";
import { BookingPanel, fieldClass, primaryClass } from "../booking/shared";
import { ClassicLink, FormNote, StudioHeading } from "./shared";
import { Group, labelClass, useSiteBoard } from "./site";
import type { StudioSite } from "./types";

const PASSWORD_ERRORS = { validation: "errorValidation", mismatch: "errorMismatch", wrongCurrent: "errorWrongCurrent", rateLimited: "errorRateLimited" } as const;

/** Submits by hand so React leaves the fields as typed (see useSiteSave). */
function bySubmit(action: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => action(data));
  };
}

/** Name and email, the password, and signing out everywhere. */
export default function AccountScreen({ site }: { site: StudioSite }) {
  const t = useTranslations("album3d");
  const ta = useTranslations("account");
  const tr = useTranslations("register");
  const tc = useTranslations("common");
  const [profile, saveProfile, savingProfile] = useActionState<UpdateProfileState, FormData>(updateProfile, {});
  const [password, savePassword, savingPassword] = useActionState<ChangePasswordState, FormData>(changePassword, {});
  const { username } = site.account;

  const tiles = useMemo<BoardTile[]>(
    () => [
      { id: "profile", column: 0, row: 0, kicker: tr("displayName"), main: site.displayName || `@${username}`, detail: [`@${username}`, site.email].filter(Boolean), left: 1, total: 1, status: "" }
    ],
    [site.displayName, site.email, username, tr]
  );
  useSiteBoard(`studio-account:${username}`, tiles);

  return (
    <BookingPanel expanded>
      <StudioHeading trail={t("studioCrumbs.site")} title={t("studioCrumbs.account")} />
      <form onSubmit={bySubmit(saveProfile)} aria-busy={savingProfile} className="mt-6 grid gap-4">
        <label className={labelClass}>
          {tr("username")}
          <input value={username} readOnly aria-readonly="true" autoComplete="username" className={`${fieldClass} text-fg-subtle`} />
        </label>
        <label className={labelClass}>
          {tr("displayName")}
          <input name="displayName" defaultValue={site.displayName} maxLength={80} className={fieldClass} />
          <span className="text-xs font-normal text-fg-subtle">{tr("displayNameHint")}</span>
        </label>
        <label className={labelClass}>
          {ta("email")}
          <input name="email" type="email" defaultValue={site.email} maxLength={200} autoComplete="email" className={fieldClass} />
          <span className="text-xs font-normal text-fg-subtle">{ta("emailHint")}</span>
        </label>
        <button type="submit" disabled={savingProfile} className={primaryClass}>
          {savingProfile ? t("studioSaving") : tc("save")}
          <span aria-hidden="true">→</span>
        </button>
        {!savingProfile && profile.error && <FormNote tone="error">{tc("error")}</FormNote>}
        {!savingProfile && profile.ok && <FormNote tone="ok">{tc("saved")}</FormNote>}
      </form>

      <div className="mt-8">
        <Group title={ta("changePasswordTitle")} hint={ta("changePasswordHint")}>
          <form key={password.ok ? "changed" : "open"} onSubmit={bySubmit(savePassword)} aria-busy={savingPassword} className="grid gap-4">
            <input type="text" name="username" value={username} autoComplete="username" readOnly hidden />
            {(
              [
                ["currentPassword", "current-password"],
                ["newPassword", "new-password"],
                ["confirmPassword", "new-password"]
              ] as const
            ).map(([name, complete]) => (
              <label key={name} className={labelClass}>
                {ta(name)}
                <input name={name} type="password" required autoComplete={complete} className={fieldClass} />
              </label>
            ))}
            <button type="submit" disabled={savingPassword} className={primaryClass}>
              {ta("changePassword")}
              <span aria-hidden="true">→</span>
            </button>
          </form>
          {!savingPassword && password.error && <FormNote tone="error">{ta(PASSWORD_ERRORS[password.error])}</FormNote>}
          {!savingPassword && password.ok && <FormNote tone="ok">{ta("changed")}</FormNote>}
        </Group>
      </div>

      <div className="mt-8">
        <Group title={ta("logoutEverywhereTitle")} hint={ta("logoutEverywhereHint")}>
          <form action={logoutEverywhere}>
            <input type="hidden" name="site" value="3d" />
            <ConfirmSubmit label={ta("logoutEverywhere")} confirmText={ta("logoutEverywhereConfirm")} />
          </form>
        </Group>
      </div>
      <ClassicLink href="/dashboard/settings?section=profile" />
    </BookingPanel>
  );
}
