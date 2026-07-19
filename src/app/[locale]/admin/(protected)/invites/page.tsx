import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { config } from "@/lib/config";
import { ownerName } from "@/lib/owner";
import { formatDate } from "@/lib/datetime";
import { getPlatformSettings } from "@/lib/platformSettings";
import CopyButton from "@/components/admin/CopyButton";
import InviteForm from "@/components/admin/InviteForm";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import RegistrationNoticeForm from "@/components/admin/RegistrationNoticeForm";
import { revokeInvite } from "../actions";

export const dynamic = "force-dynamic";

export default async function PlatformInvitesPage() {
  const locale = await getLocale();
  await requireAdmin(locale);
  const t = await getTranslations("platform");
  const tc = await getTranslations("common");

  const [invites, platformSettings] = await Promise.all([
    prisma.invite.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        redeemedBy: { select: { username: true, displayName: true } }
      }
    }),
    getPlatformSettings()
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("invitesTitle")}</h1>
          <p className="mt-1 text-sm text-fg-subtle">{t("invitesSubtitle")}</p>
        </div>
        <InviteForm
          labels={{
            note: t("inviteNote"),
            submit: t("newInvite"),
            cancel: tc("cancel"),
            error: tc("error")
          }}
        />
      </div>

      <RegistrationNoticeForm
        settings={platformSettings}
        labels={{
          title: t("registrationNoticeTitle"),
          description: t("registrationNoticeDescription"),
          enabled: t("registrationNoticeEnabled"),
          enabledHint: t("registrationNoticeEnabledHint"),
          mode: t("registrationNoticeMode"),
          informationMode: t("registrationNoticeModeInformation"),
          consentMode: t("registrationNoticeModeConsent"),
          consentModeHint: t("registrationNoticeModeHint"),
          delay: t("registrationNoticeDelay"),
          delayHint: t("registrationNoticeDelayHint"),
          titleEn: t("registrationNoticeTitleEn"),
          titleZh: t("registrationNoticeTitleZh"),
          bodyEn: t("registrationNoticeBodyEn"),
          bodyZh: t("registrationNoticeBodyZh"),
          bodyHint: t("registrationNoticeBodyHint"),
          save: tc("save"),
          saved: tc("saved"),
          error: t("registrationNoticeError")
        }}
      />

      {invites.length === 0 ? (
        <p className="py-12 text-center text-fg-subtle">{t("noInvites")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {invites.map((inv) => {
            const url = `${config.appBaseUrl()}/${locale}/register/${inv.code}`;
            const expired =
              !inv.redeemedAt && inv.expiresAt && inv.expiresAt < new Date();
            return (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="font-medium">
                    {inv.note || <span className="text-fg-subtle">—</span>}
                  </span>
                  <span className="text-xs text-fg-subtle">
                    {inv.redeemedAt
                      ? t("inviteRedeemed", {
                          name: inv.redeemedBy ? ownerName(inv.redeemedBy) : "—"
                        })
                      : expired
                        ? t("inviteExpired")
                        : t("inviteUnused")}
                    {" · "}
                    {formatDate(inv.createdAt)}
                  </span>
                  {/* The link is only useful until it is used; showing a spent
                      code invites confusion about why it no longer works. */}
                  {!inv.redeemedAt && !expired && (
                    <code className="mt-1 block max-w-full truncate rounded bg-fg/5 px-2 py-1 text-xs text-fg-muted">
                      {url}
                    </code>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!inv.redeemedAt && !expired && (
                    <CopyButton
                      text={url}
                      label={t("inviteCopy")}
                      copiedLabel={t("inviteCopied")}
                    />
                  )}
                  {!inv.redeemedAt && (
                    <form action={revokeInvite}>
                      <input type="hidden" name="id" value={inv.id} />
                      <ConfirmSubmit
                        label={t("inviteRevoke")}
                        confirmText={t("inviteRevokeConfirm")}
                      />
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
