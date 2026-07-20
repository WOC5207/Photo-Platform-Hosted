import { getTranslations } from "next-intl/server";
import { pickText } from "@/lib/content";
import type { ActivePlatformNotification } from "@/lib/platformNotifications";
import { dismissPlatformNotification } from "@/app/[locale]/dashboard/(protected)/actions";

/**
 * Platform-admin notifications shown at the top of the management area until
 * this user dismisses them. Server component on purpose: dismissal is a plain
 * form posting to a server action, so the banner needs no client JS and the
 * DB-backed dismissal holds across devices.
 */
export default async function PlatformNoticeBanner({
  notifications,
  locale
}: {
  notifications: ActivePlatformNotification[];
  locale: string;
}) {
  if (notifications.length === 0) return null;
  const t = await getTranslations("adminNotifications");

  return (
    <div className="mb-6 flex flex-col gap-3" data-testid="platform-notices">
      {notifications.map((notification) => {
        const title = pickText(locale, notification.titleEn, notification.titleZh);
        const body = pickText(locale, notification.bodyEn, notification.bodyZh);
        return (
          <section
            key={notification.id}
            role="status"
            aria-label={t("bannerAria")}
            className="flex items-start justify-between gap-4 rounded-xl border border-border-strong bg-surface p-4 shadow-sm"
          >
            <div className="min-w-0">
              <h2 className="font-semibold text-fg">{title}</h2>
              {body && (
                <p className="mt-1 whitespace-pre-line text-sm text-fg-muted">
                  {body}
                </p>
              )}
            </div>
            <form action={dismissPlatformNotification} className="shrink-0">
              <input type="hidden" name="notificationId" value={notification.id} />
              <button
                type="submit"
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-strong px-3 py-2 text-xs font-semibold text-fg-muted transition hover:border-fg-subtle hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg/40 max-sm:min-h-11"
              >
                {t("dismiss")}
              </button>
            </form>
          </section>
        );
      })}
    </div>
  );
}
