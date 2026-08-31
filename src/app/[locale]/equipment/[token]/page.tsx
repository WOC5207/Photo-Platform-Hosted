import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ownerBasePath, ownerName } from "@/lib/owner";
import { buttonClasses } from "@/components/ui/Button";

export default async function EquipmentLabelPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const [{ token }, locale, t, currentUser] = await Promise.all([
    params,
    getLocale(),
    getTranslations("equipment"),
    getCurrentUser()
  ]);
  const equipment = await prisma.equipmentItem.findUnique({
    where: { qrToken: token },
    include: { owner: true }
  });
  if (!equipment || equipment.owner.status !== "active") notFound();
  const isOwner = currentUser?.id === equipment.ownerId;

  return (
    <main className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-4 py-12 sm:px-6">
      <article className="ui-panel w-full overflow-hidden p-6 sm:p-10">
        <p className="font-meta text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {t("scanPageEyebrow")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {equipment.name}
        </h1>
        <p className="mt-3 text-sm text-fg-subtle">
          {equipment.category || t("uncategorized")}
        </p>
        <div className="mt-8 rounded-xl border border-border bg-control p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            {t("belongsTo")}
          </p>
          <p className="mt-2 text-lg font-semibold text-fg">
            {ownerName(equipment.owner)}
          </p>
          <p className="mt-1 text-sm text-fg-subtle">@{equipment.owner.username}</p>
        </div>
        <p className="mt-6 text-sm leading-6 text-fg-muted">
          {t("scanPageHint")}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={ownerBasePath(equipment.owner.username)}
            className={buttonClasses({ variant: "primary" })}
          >
            {t("visitPhotographer")}
          </Link>
          {isOwner && (
            <Link href="/dashboard/equipment" className={buttonClasses()}>
              {t("manageEquipment")}
            </Link>
          )}
        </div>
        <p className="mt-8 font-mono text-[0.625rem] text-fg-faint">
          {locale.toUpperCase()} · {equipment.qrToken.slice(0, 8).toUpperCase()}
        </p>
      </article>
    </main>
  );
}
