import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatBytes } from "@/lib/storage";
import NewTierForm from "@/components/admin/NewTierForm";
import TierRow from "@/components/admin/TierRow";

export const dynamic = "force-dynamic";

/**
 * Storage tiers: named allowances, defined once and assigned to accounts from
 * the storage page. The default is what every new account gets, and what an
 * expired assignment falls back to.
 */
export default async function TiersPage() {
  const locale = await getLocale();
  await requireAdmin(locale);
  const t = await getTranslations("adminTiers");

  const tiers = await prisma.tier.findMany({
    orderBy: [{ sortOrder: "asc" }, { quotaBytes: "asc" }],
    include: { _count: { select: { users: true } } }
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-fg-subtle">{t("intro")}</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-surface text-left text-fg-subtle">
            <tr>
              <th className="px-4 py-3 font-medium">{t("colName")}</th>
              <th className="px-4 py-3 font-medium">{t("colLimit")}</th>
              <th className="px-4 py-3 font-medium">{t("colAccounts")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => (
              <TierRow
                key={tier.id}
                tier={{
                  id: tier.id,
                  name: tier.name,
                  // Two decimals so a sub-GiB tier (a trial, say) does not
                  // round to zero and become "no storage at all" on save.
                  quotaGib: Math.round((Number(tier.quotaBytes) / 1024 ** 3) * 100) / 100,
                  quotaLabel: formatBytes(Number(tier.quotaBytes)),
                  isDefault: tier.isDefault,
                  accountCount: tier._count.users
                }}
                labels={{
                  save: t("save"),
                  unit: t("unitGib"),
                  makeDefault: t("makeDefault"),
                  defaultBadge: t("defaultBadge"),
                  defaultHint: t("defaultHint"),
                  delete: t("delete"),
                  confirmDelete: t("confirmDelete"),
                  errorIsDefault: t("errorIsDefault"),
                  errorInUse: t("errorInUse"),
                  accounts: t("accountsCount", { count: tier._count.users })
                }}
              />
            ))}
          </tbody>
        </table>
      </div>

      <NewTierForm
        labels={{
          title: t("newTitle"),
          name: t("namePlaceholder"),
          limit: t("colLimit"),
          unit: t("unitGib"),
          create: t("create"),
          errorValidation: t("errorValidation"),
          errorDuplicate: t("errorDuplicate")
        }}
      />
    </div>
  );
}
