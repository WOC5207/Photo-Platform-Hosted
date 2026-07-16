import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";
import { getPlatformStorage, formatBytes } from "@/lib/storage";
import { ownerName } from "@/lib/owner";
import QuotaControls from "@/components/admin/QuotaControls";

export const dynamic = "force-dynamic";

/**
 * Platform-wide storage: who is using what, and the controls to do something
 * about it. The per-account view lives on each user's own dashboard.
 */
export default async function PlatformStoragePage() {
  const locale = await getLocale();
  await requireAdmin(locale);
  const t = await getTranslations("adminStorage");

  const { accounts, totalUsedBytes, databaseBytes } = await getPlatformStorage();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">{t("intro")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-fg-subtle">{t("platformTotal")}</p>
          <p className="mt-1 text-2xl font-bold">{formatBytes(totalUsedBytes)}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-fg-subtle">{t("databaseLabel")}</p>
          <p className="mt-1 text-2xl font-bold">{formatBytes(databaseBytes)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="border-b border-border bg-surface text-left text-fg-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">{t("colAccount")}</th>
              <th className="px-4 py-3 font-medium">{t("colPhotos")}</th>
              <th className="px-4 py-3 font-medium">{t("colUsed")}</th>
              <th className="px-4 py-3 font-medium">{t("colQuota")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const pct =
                a.quotaBytes > 0
                  ? Math.min(100, (a.usedBytes / a.quotaBytes) * 100)
                  : 0;
              return (
                <tr key={a.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{ownerName(a)}</span>
                      <span className="text-xs text-fg-subtle">/u/{a.username}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{a.photoCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span className="text-fg-muted">{formatBytes(a.usedBytes)}</span>
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-fg/10">
                        <div
                          className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : "bg-fg/60"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {formatBytes(a.quotaBytes)}
                  </td>
                  <td className="px-4 py-3">
                    <QuotaControls
                      userId={a.id}
                      quotaGib={
                        // Round-trip through GiB for the form; the action
                        // converts back. Two decimals keeps sub-GiB quotas
                        // (a trial account, say) from rounding to zero.
                        Math.round((a.quotaBytes / 1024 ** 3) * 100) / 100
                      }
                      labels={{
                        set: t("setQuota"),
                        unit: t("quotaGib"),
                        reconcile: t("reconcile"),
                        reconcileHint: t("reconcileHint")
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
