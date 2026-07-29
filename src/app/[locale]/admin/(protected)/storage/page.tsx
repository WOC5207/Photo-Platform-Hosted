import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";
import { getPlatformStorage, formatBytes } from "@/lib/storage";
import { Link } from "@/i18n/navigation";
import { prisma } from "@/lib/db";
import { retryModerationErrors } from "../moderation/actions";

export const dynamic = "force-dynamic";

/**
 * Platform-wide storage: is the disk filling up.
 *
 * Deliberately only the figures that are not about any one account. Per-account
 * usage, tier and limit live on the Accounts page next to the account they
 * describe — deciding whether to raise someone's allowance should not mean
 * holding two screens in your head.
 */
export default async function PlatformStoragePage() {
  const locale = await getLocale();
  await requireAdmin(locale);
  const t = await getTranslations("adminStorage");
  const tm = await getTranslations("adminModeration");

  const [{ accounts, totalUsedBytes, databaseBytes }, moderationErrors] =
    await Promise.all([
      getPlatformStorage(),
      prisma.photo.count({ where: { moderationStatus: "error" } })
    ]);

  // The one account-shaped question that is really about the platform: who is
  // closest to their limit. Not a management view — a pointer at whoever is
  // about to start having uploads refused.
  const nearLimit = accounts
    .filter((a) => a.quotaBytes > 0 && a.usedBytes / a.quotaBytes >= 0.8)
    .sort((a, b) => b.usedBytes / b.quotaBytes - a.usedBytes / a.quotaBytes);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t("platformHealthTitle")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">{t("platformHealthIntro")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-fg-subtle">{t("platformTotal")}</p>
          <p className="mt-1 text-2xl font-bold">{formatBytes(totalUsedBytes)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-fg-subtle">{t("databaseLabel")}</p>
          <p className="mt-1 text-2xl font-bold">{formatBytes(databaseBytes)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-fg-subtle">{t("accountsLabel")}</p>
          <p className="mt-1 text-2xl font-bold">{accounts.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">{t("nearLimitTitle")}</h2>
        {nearLimit.length === 0 ? (
          <p className="mt-1 text-sm text-fg-subtle">{t("nearLimitNone")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {nearLimit.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/admin/accounts/${a.id}`}
                  className="flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 transition hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
                >
                  <span className="text-sm">
                    {a.displayName || a.username}
                    <span className="ml-2 text-xs text-fg-subtle">
                      /u/{a.username}
                    </span>
                  </span>
                  <span className="text-sm text-fg-muted">
                    {formatBytes(a.usedBytes)} / {formatBytes(a.quotaBytes)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-fg-subtle">
          {t("manageOnAccounts")}{" "}
          <Link href="/admin" className="underline hover:text-fg">
            {t("accountsLink")}
          </Link>
        </p>
      </div>

      {moderationErrors > 0 && (
        <div className="rounded-xl border border-danger-border bg-danger-surface/40 p-4">
          <h2 className="text-lg font-semibold text-danger-strong">
            {tm("healthErrorTitle")}
          </h2>
          <p className="mt-1 text-sm text-fg-subtle">
            {tm("healthErrorDescription", { count: moderationErrors })}
          </p>
          <form action={retryModerationErrors} className="mt-3">
            <button
              type="submit"
              className="min-h-10 rounded-lg border border-danger-border px-3 py-2 text-sm font-semibold text-danger"
            >
              {tm("retryErrors")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
