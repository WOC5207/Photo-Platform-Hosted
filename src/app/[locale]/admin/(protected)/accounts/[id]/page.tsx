import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { ownerBasePath, ownerName } from "@/lib/owner";
import { formatDate } from "@/lib/datetime";
import { formatBytes } from "@/lib/storage";
import { getQuotaUsage } from "@/lib/quota";
import { Link } from "@/i18n/navigation";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import ResetPasswordControl from "@/components/admin/ResetPasswordControl";
import QuotaControls from "@/components/admin/QuotaControls";
import TierAssignment from "@/components/admin/TierAssignment";
import { deleteUser, setUserStatus } from "../../actions";

export const dynamic = "force-dynamic";

/** YYYY-MM-DD in the server's zone, which is what <input type="date"> wants. */
function dateInputValue(d: Date | null): string {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * One account, and every control that changes it. The list at /admin is
 * read-only on purpose; here there is exactly one account on screen, so a
 * destructive button cannot be next to the wrong row.
 */
export default async function AccountDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const locale = await getLocale();
  const admin = await requireAdmin(locale);
  const { id } = await params;
  const t = await getTranslations("platform");
  const ts = await getTranslations("adminStorage");

  const [user, tiers] = await Promise.all([
    prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        status: true,
        createdAt: true,
        tierId: true,
        _count: { select: { events: true } }
      }
    }),
    prisma.tier.findMany({
      orderBy: [{ sortOrder: "asc" }, { quotaBytes: "asc" }],
      select: { id: true, name: true }
    })
  ]);
  if (!user) notFound();

  // The same expression the upload check enforces, so this page cannot show a
  // limit the uploader would not honour.
  const usage = await getQuotaUsage(user.id);
  const pct =
    usage.quotaBytes > 0
      ? Math.min(100, (usage.usedBytes / usage.quotaBytes) * 100)
      : 0;
  const isSelf = user.id === admin.id;

  const section = "rounded-xl border border-border bg-surface p-4";

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-fg-subtle hover:text-fg"
        >
          ← {t("backToAccounts")}
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-bold">{ownerName(user)}</h1>
          <Link
            href={ownerBasePath(user.username)}
            className="text-sm text-fg-subtle underline decoration-fg/30 underline-offset-2 hover:text-fg"
          >
            /u/{user.username}
          </Link>
        </div>
        {/* The quick facts, restated here so acting on the account never
            requires flipping back to the list to remember who it is. */}
        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-fg-subtle">{t("colRole")}</dt>
            <dd className="text-fg-muted">
              {user.role === "admin" ? t("roleAdmin") : t("roleUser")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">{t("colStatus")}</dt>
            <dd
              className={
                user.status === "active" ? "text-fg-muted" : "text-danger"
              }
            >
              {user.status === "active"
                ? t("statusActive")
                : t("statusSuspended")}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">{t("colAlbums")}</dt>
            <dd className="text-fg-muted">{user._count.events}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-subtle">{t("colJoined")}</dt>
            <dd className="text-fg-muted">{formatDate(user.createdAt)}</dd>
          </div>
        </dl>
      </div>

      <div className={section}>
        <h2 className="text-lg font-semibold">{ts("storagePlanTitle")}</h2>
        <div className="mt-3 flex flex-col gap-2">
          <span className="text-sm text-fg-muted">
            {formatBytes(usage.usedBytes)} / {formatBytes(usage.quotaBytes)}
          </span>
          <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-fg/10">
            <div
              className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : "bg-fg/60"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-fg-subtle">
            {usage.overridden
              ? ts("sourceOverride")
              : ts("sourceTier", { tier: usage.tierName })}
          </span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-border bg-page p-4">
            <h3 className="text-sm font-semibold">{t("tierTitle")}</h3>
            <p className="mt-1 text-xs text-fg-subtle">{ts("tierChoiceHint")}</p>
            <div className="mt-3">
              <TierAssignment
                userId={user.id}
                tiers={tiers}
                current={{
                  tierId: user.tierId,
                  expiresAt: dateInputValue(usage.tierExpiresAt),
                  expired: usage.expired,
                  overridden: usage.overridden
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
            </div>
          </section>

          <section className="rounded-lg border border-border bg-page p-4">
            <h3 className="text-sm font-semibold">{ts("customLimitTitle")}</h3>
            <p className="mt-1 text-xs text-fg-subtle">{ts("customLimitHint")}</p>
            <div className="mt-3">
              <QuotaControls
                userId={user.id}
                quotaGib={
                  Math.round((usage.quotaBytes / 1024 ** 3) * 100) / 100
                }
                labels={{
                  set: ts("setQuota"),
                  unit: ts("quotaGib"),
                  reconcile: ts("reconcile"),
                  reconcileHint: ts("reconcileHint")
                }}
              />
            </div>
          </section>
        </div>
      </div>

      {/* Suspend, delete and reset are grouped and last: everything above
          adjusts the account, everything here takes something away from it. On
          your own account the whole section is a note instead — no self-
          suspend or self-delete (nothing could undo them), and a generated
          password for yourself is pointless when Dashboard -> Account changes
          it properly. */}
      <div className={section}>
        <h2 className="text-lg font-semibold text-danger">{t("dangerTitle")}</h2>
        {isSelf ? (
          <p className="mt-2 text-sm text-fg-subtle">{t("cannotSuspendSelf")}</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-start gap-3">
            <form action={setUserStatus}>
              <input type="hidden" name="id" value={user.id} />
              <input
                type="hidden"
                name="status"
                value={user.status === "active" ? "suspended" : "active"}
              />
              <button
                type="submit"
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-fg-muted hover:border-fg-faint hover:text-fg"
              >
                {user.status === "active" ? t("suspend") : t("unsuspend")}
              </button>
            </form>
            <ResetPasswordControl
              userId={user.id}
              labels={{
                reset: t("resetPassword"),
                confirm: t("resetPasswordConfirm", { username: user.username }),
                generatedFor: t("resetPasswordGenerated", {
                  username: user.username
                }),
                copyHint: t("resetPasswordCopyHint"),
                error: t("resetPasswordError")
              }}
            />
            <form action={deleteUser}>
              <input type="hidden" name="id" value={user.id} />
              <ConfirmSubmit
                label={t("deleteUser")}
                confirmText={t("deleteUserConfirm")}
              />
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
