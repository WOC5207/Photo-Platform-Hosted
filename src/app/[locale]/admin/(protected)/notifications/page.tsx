import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { getNotificationSummaries } from "@/lib/platformNotifications";
import { pickText } from "@/lib/content";
import { formatDate } from "@/lib/datetime";
import { ownerName } from "@/lib/owner";
import NotificationComposer from "@/components/admin/NotificationComposer";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import PageHeader from "@/components/ui/PageHeader";
import SectionHeading from "@/components/ui/SectionHeading";
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
    <div className="flex flex-col gap-8">
      <PageHeader title={t("pageTitle")} description={t("intro")} />

      <NotificationComposer accounts={accounts} />

      <section className="flex flex-col gap-4">
        <SectionHeading title={t("sentTitle")} />
        {notifications.length === 0 && (
          <p className="ui-panel flex min-h-32 items-center justify-center p-6 text-sm text-fg-subtle">
            {t("noneSent")}
          </p>
        )}
        <ul className="flex flex-col gap-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-lg font-semibold tracking-[-0.015em]">
                    {pickText(locale, notification.titleEn, notification.titleZh)}
                  </h3>
                  <p className="font-meta mt-1 text-[0.6875rem] text-fg-subtle">
                    {formatDate(notification.createdAt)} ·{" "}
                    {notification.audience === "all"
                      ? t("audienceAll")
                      : t("audienceSummary", {
                          names: notification.targets
                            .map((target) => ownerName(target))
                            .join(", ")
                        })}
                  </p>
                  <p className="mt-2 inline-flex rounded-md bg-control px-2 py-1 text-[0.6875rem] font-semibold text-fg-muted">
                    {notification.emailRequested
                      ? t("emailRequested")
                      : t("inAppOnly")}
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
