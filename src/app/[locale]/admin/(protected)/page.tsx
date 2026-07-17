import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ownerBasePath, ownerName } from "@/lib/owner";
import { formatDate } from "@/lib/datetime";
import { formatBytes, getPlatformStorage } from "@/lib/storage";
import { Link } from "@/i18n/navigation";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import ResetPasswordControl from "@/components/admin/ResetPasswordControl";
import QuotaControls from "@/components/admin/QuotaControls";
import TierAssignment from "@/components/admin/TierAssignment";
import { deleteUser, setUserStatus } from "./actions";

export const dynamic = "force-dynamic";

/** YYYY-MM-DD in the server's zone, which is what <input type="date"> wants. */
function dateInputValue(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Everything about an account in one place: who they are, what they are using,
 * which tier they are on, and every control that changes any of it.
 *
 * Storage and tier used to live on a separate page, which meant deciding
 * whether to raise someone's limit involved holding two screens in your head.
 * The tier *definitions* are still their own page — those belong to the
 * platform rather than to any one account, and editing "Pro" from inside
 * Alice's row would invite changing twenty people's limits while thinking
 * about one.
 */
export default async function PlatformUsersPage() {
  const locale = await getLocale();
  const admin = await requireAdmin(locale);
  const t = await getTranslations("platform");
  const ts = await getTranslations("adminStorage");

  const [users, { accounts }, tiers] = await Promise.all([
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
    getPlatformStorage(),
    prisma.tier.findMany({
      orderBy: [{ sortOrder: "asc" }, { quotaBytes: "asc" }],
      select: { id: true, name: true }
    })
  ]);

  // getPlatformStorage sorts by usage; this page is ordered by join date. Key
  // by id rather than zipping the two lists, which would silently pair the
  // wrong rows together.
  const storageById = new Map(accounts.map((a) => [a.id, a]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("usersTitle")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">{t("usersSubtitle")}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[1180px] text-sm">
          <thead className="border-b border-border bg-surface text-left text-fg-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">{t("colUser")}</th>
              <th className="px-4 py-3 font-medium">{t("colRole")}</th>
              <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
              <th className="px-4 py-3 font-medium">{t("colAlbums")}</th>
              <th className="px-4 py-3 font-medium">{t("colJoined")}</th>
              <th className="px-4 py-3 font-medium">{ts("colUsed")}</th>
              <th className="px-4 py-3 font-medium">{ts("colTier")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = u.id === admin.id;
              const s = storageById.get(u.id);
              const pct =
                s && s.quotaBytes > 0
                  ? Math.min(100, (s.usedBytes / s.quotaBytes) * 100)
                  : 0;
              return (
                <tr
                  key={u.id}
                  className="border-b border-border align-top last:border-0"
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{ownerName(u)}</span>
                      <Link
                        href={ownerBasePath(u.username)}
                        className="text-xs text-fg-subtle underline decoration-fg/30 underline-offset-2 hover:text-fg"
                      >
                        /u/{u.username}
                      </Link>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {u.role === "admin" ? t("roleAdmin") : t("roleUser")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.status === "active" ? "text-fg-muted" : "text-red-500"
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

                  {/* Storage: what they are using, against what, and where that
                      limit came from — a bare figure that may or may not match
                      the tier beside it is worse than no figure. */}
                  <td className="px-4 py-3">
                    {s && (
                      <div className="flex flex-col gap-1">
                        <span className="text-fg-muted">
                          {formatBytes(s.usedBytes)} / {formatBytes(s.quotaBytes)}
                        </span>
                        <div className="h-1.5 w-28 overflow-hidden rounded-full bg-fg/10">
                          <div
                            className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : "bg-fg/60"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-fg-subtle">
                          {s.overridden
                            ? ts("sourceOverride")
                            : ts("sourceTier", { tier: s.tierName })}
                        </span>
                        <QuotaControls
                          userId={u.id}
                          quotaGib={
                            // Round-trip through GiB for the form; the action
                            // converts back. Two decimals keeps a sub-GiB
                            // override from rounding away to zero.
                            Math.round((s.quotaBytes / 1024 ** 3) * 100) / 100
                          }
                          labels={{
                            set: ts("setQuota"),
                            unit: ts("quotaGib"),
                            reconcile: ts("reconcile"),
                            reconcileHint: ts("reconcileHint")
                          }}
                        />
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {s && (
                      <TierAssignment
                        userId={u.id}
                        tiers={tiers}
                        current={{
                          tierId: s.tierId,
                          expiresAt: dateInputValue(s.tierExpiresAt),
                          expired: s.expired,
                          overridden: s.overridden
                        }}
                        labels={{
                          defaultTier: ts("defaultTierOption"),
                          save: ts("assign"),
                          expiresAt: ts("expiresAtHint"),
                          expiredNote: ts("expiredNote"),
                          overrideNote: ts("overrideNote"),
                          clearOverride: ts("clearOverride")
                        }}
                      />
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {isSelf ? (
                      // No self-suspend, no self-delete: either would leave the
                      // platform with no way back in.
                      <span className="text-xs text-fg-subtle">
                        {t("cannotSuspendSelf")}
                      </span>
                    ) : (
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center justify-end gap-2">
                          <form action={setUserStatus}>
                            <input type="hidden" name="id" value={u.id} />
                            <input
                              type="hidden"
                              name="status"
                              value={u.status === "active" ? "suspended" : "active"}
                            />
                            <button
                              type="submit"
                              className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-fg-muted hover:border-fg-faint hover:text-fg"
                            >
                              {u.status === "active" ? t("suspend") : t("unsuspend")}
                            </button>
                          </form>
                          <form action={deleteUser}>
                            <input type="hidden" name="id" value={u.id} />
                            <ConfirmSubmit
                              label={t("deleteUser")}
                              confirmText={t("deleteUserConfirm")}
                            />
                          </form>
                        </div>
                        {/* Not offered for your own account: you would be
                            handing yourself a random password to type back in,
                            when Dashboard -> Account changes it properly. */}
                        <ResetPasswordControl
                          userId={u.id}
                          labels={{
                            reset: t("resetPassword"),
                            confirm: t("resetPasswordConfirm", { username: u.username }),
                            generatedFor: t("resetPasswordGenerated", {
                              username: u.username
                            }),
                            copyHint: t("resetPasswordCopyHint"),
                            error: t("resetPasswordError")
                          }}
                        />
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
