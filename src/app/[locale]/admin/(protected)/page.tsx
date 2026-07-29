import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ownerName } from "@/lib/owner";
import { formatDate } from "@/lib/datetime";
import { formatBytes, getPlatformStorage } from "@/lib/storage";
import { Link } from "@/i18n/navigation";
import PageHeader from "@/components/ui/PageHeader";

export const dynamic = "force-dynamic";

/**
 * The account list: who is on the platform and how they are doing, at a
 * glance. Deliberately read-only — with three forms per row this was a control
 * panel pretending to be a list, and the row for the account you were changing
 * was indistinguishable from the nineteen you were not. Every control lives on
 * the account's own page now, one click through the name.
 */
export default async function PlatformUsersPage() {
  const locale = await getLocale();
  await requireAdmin(locale);
  const t = await getTranslations("platform");
  const ts = await getTranslations("adminStorage");

  const [users, { accounts }] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        _count: { select: { events: true } }
      }
    }),
    // Resolves each account's effective allowance (override / tier / expiry)
    // through the same SQL the upload check uses, so this page cannot show a
    // limit the uploader would not honour.
    getPlatformStorage()
  ]);

  // getPlatformStorage sorts by usage; this page is ordered by join date. Key
  // by id rather than zipping the two lists, which would silently pair the
  // wrong rows together.
  const storageById = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={t("usersTitle")} description={t("usersSubtitle")} />

      <ul className="grid gap-3 xl:hidden">
        {users.map((u) => {
          const s = storageById.get(u.id);
          const pct =
            s && s.quotaBytes > 0
              ? Math.min(100, (s.usedBytes / s.quotaBytes) * 100)
              : 0;

          return (
            <li key={u.id} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <Link
                    href={`/admin/accounts/${u.id}`}
                    className="font-semibold underline decoration-accent/40 underline-offset-4 hover:text-accent-strong hover:decoration-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  >
                    {ownerName(u)}
                  </Link>
                  <p className="truncate text-xs text-fg-subtle">/u/{u.username}</p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    u.status === "active"
                      ? "bg-success-surface text-success"
                      : "bg-danger-surface text-danger"
                  }`}
                >
                  {u.status === "active" ? t("statusActive") : t("statusSuspended")}
                </span>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-fg-subtle">{t("colRole")}</dt>
                  <dd className="mt-0.5 text-fg-muted">
                    {u.role === "admin" ? t("roleAdmin") : t("roleUser")}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">{t("colAlbums")}</dt>
                  <dd className="mt-0.5 text-fg-muted">{u._count.events}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">{t("colJoined")}</dt>
                  <dd className="mt-0.5 text-fg-muted">{formatDate(u.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-fg-subtle">{ts("colTier")}</dt>
                  <dd className="mt-0.5 text-fg-muted">{s?.tierName ?? "—"}</dd>
                </div>
              </dl>

              {s && (
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3 text-xs text-fg-subtle">
                    <span>{ts("colUsed")}</span>
                    <span>{formatBytes(s.usedBytes)} / {formatBytes(s.quotaBytes)}</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-control">
                    <div
                      className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : "bg-fg/60"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {(s.overridden || s.expired) && (
                    <p className="mt-1.5 text-xs text-fg-subtle">
                      {s.overridden ? ts("sourceOverride") : ts("expiredNote")}
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface xl:block">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="border-b border-border bg-control text-left text-fg-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">{t("colUser")}</th>
              <th className="px-4 py-3 font-medium">{t("colRole")}</th>
              <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
              <th className="px-4 py-3 font-medium">{t("colAlbums")}</th>
              <th className="px-4 py-3 font-medium">{t("colJoined")}</th>
              <th className="px-4 py-3 font-medium">{ts("colUsed")}</th>
              <th className="px-4 py-3 font-medium">{ts("colTier")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const s = storageById.get(u.id);
              const pct =
                s && s.quotaBytes > 0
                  ? Math.min(100, (s.usedBytes / s.quotaBytes) * 100)
                  : 0;
              return (
                <tr
                  key={u.id}
                  className="border-b border-border transition-colors hover:bg-raised last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      {/* The name is the way in: everything that CHANGES this
                          account lives on its own page. */}
                      <Link
                        href={`/admin/accounts/${u.id}`}
                        className="font-semibold underline decoration-accent/40 underline-offset-4 hover:text-accent-strong hover:decoration-accent"
                      >
                        {ownerName(u)}
                      </Link>
                      <span className="text-xs text-fg-subtle">
                        /u/{u.username}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {u.role === "admin" ? t("roleAdmin") : t("roleUser")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.status === "active" ? "text-fg-muted" : "text-danger"
                      }
                    >
                      {u.status === "active"
                        ? t("statusActive")
                        : t("statusSuspended")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{u._count.events}</td>
                  <td className="px-4 py-3 text-fg-muted">
                    {formatDate(u.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    {s && (
                      <div className="flex flex-col gap-1">
                        <span className="text-fg-muted">
                          {formatBytes(s.usedBytes)} / {formatBytes(s.quotaBytes)}
                        </span>
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-control">
                          <div
                            className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : "bg-fg/60"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s && (
                      <div className="flex flex-col">
                        <span className="text-fg-muted">{s.tierName}</span>
                        {/* The two states where the tier name alone would
                            mislead: the limit is not actually the tier's, or
                            the assignment has already lapsed. */}
                        {s.overridden && (
                          <span className="text-xs text-fg-subtle">
                            {ts("sourceOverride")}
                          </span>
                        )}
                        {s.expired && (
                          <span className="text-xs text-fg-subtle">
                            {ts("expiredNote")}
                          </span>
                        )}
                      </div>
                    )}
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
