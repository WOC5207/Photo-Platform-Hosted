import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getNotificationSummaries } from "@/lib/platformNotifications";
import { pickText } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import { ownerName } from "@/lib/owner";
import NotificationComposer from "@/components/admin/NotificationComposer";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { deleteNotification } from "./actions";

// Auth depends on the request cookie — never prerender. The layout's
// requireAdmin is the authorisation.
export const dynamic = "force-dynamic";

export default async function PlatformNotificationsPage() {
  const t = await getTranslations("adminNotifications");
  const locale = await getLocale();

  const [accounts, notifications] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, displayName: true }
    }),
    getNotificationSummaries()
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pageTitle")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">{t("intro")}</p>
      </div>

      <NotificationComposer accounts={accounts} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{t("sentTitle")}</h2>
        {notifications.length === 0 && (
          <p className="text-sm text-fg-subtle">{t("noneSent")}</p>
        )}
        <ul className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className="flex flex-col gap-2 rounded-xl border border-border-strong p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">
                    {pickText(locale, notification.titleEn, notification.titleZh)}
                  </h3>
                  <p className="text-xs text-fg-subtle">
                    {formatDate(notification.createdAt)} ·{" "}
                    {notification.audience === "all"
                      ? t("audienceAll")
                      : t("audienceSummary", {
                          names: notification.targets
                            .map((target) => ownerName(target))
                            .join(", ")
                        })}
                  </p>
                </div>
                <form action={deleteNotification}>
                  <input type="hidden" name="id" value={notification.id} />
                  <ConfirmSubmit
                    label={t("delete")}
                    confirmText={t("confirmDelete")}
                  />
                </form>
              </div>
              {(notification.bodyEn || notification.bodyZh) && (
                <p className="whitespace-pre-line text-sm text-fg-muted">
                  {pickText(locale, notification.bodyEn, notification.bodyZh)}
                </p>
              )}
              <p className="text-xs text-fg-subtle" data-testid="dismissed-count">
                {t("dismissedCount", {
                  dismissed: notification.dismissedCount,
                  targeted: notification.targetedCount
                })}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
