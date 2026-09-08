import { notFound } from "next/navigation";
import EquipmentContact from "@/components/equipment/EquipmentContact";
import EquipmentQrOwnerControls from "@/components/equipment/EquipmentQrOwnerControls";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ownerBasePath, ownerName } from "@/lib/owner";
import { buttonClasses } from "@/components/ui/Button";
import { equipmentName } from "@/lib/equipment";

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
    select: {
      id: true,
      ownerId: true,
      name: true,
      brand: true,
      model: true,
      serialNumber: true,
      photoToken: true,
      qrToken: true,
      status: true,
      category: { select: { name: true } },
      owner: {
        select: {
          status: true,
          username: true,
          displayName: true,
          settings: {
            select: {
              equipmentContactMethod: true,
              equipmentContactLabel: true,
              equipmentContactValue: true
            }
          }
        }
      }
    }
  });
  if (!equipment || equipment.owner.status !== "active") notFound();
  const isOwner = currentUser?.id === equipment.ownerId;
  const displayName = equipmentName(equipment);

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-[70vh] w-full max-w-2xl items-center px-4 py-12 sm:px-6">
      <article className="ui-panel w-full overflow-hidden p-6 sm:p-10">
        <p className="font-meta text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          {t("scanPageEyebrow")}
        </p>
        <h1 className="font-display mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
          {displayName}
        </h1>
        <p className="mt-3 text-sm text-fg-subtle">
          {equipment.category.name}{equipment.brand ? ` · ${equipment.brand}` : ""}
        </p>
        {equipment.serialNumber && <p className="mt-4 break-words text-sm">{t("serialShort")}: {equipment.serialNumber}</p>}
        {equipment.photoToken && <img src={`/api/equipment/${equipment.qrToken}/photo`} alt={displayName} className="mt-6 max-h-80 w-full rounded-lg object-contain bg-control" />}
        {isOwner && (
          <EquipmentQrOwnerControls
            equipmentId={equipment.id}
            token={equipment.qrToken}
            initialStatus={equipment.status}
          />
        )}
        {equipment.owner.settings?.equipmentContactValue && equipment.owner.settings.equipmentContactMethod && (
          <EquipmentContact method={equipment.owner.settings.equipmentContactMethod} label={equipment.owner.settings.equipmentContactLabel} value={equipment.owner.settings.equipmentContactValue} />
        )}
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
        </div>
        <p className="mt-8 font-mono text-[0.625rem] text-fg-faint">
          {locale.toUpperCase()} · {equipment.qrToken.slice(0, 8).toUpperCase()}
        </p>
      </article>
    </main>
  );
}
