import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import EquipmentPhotoUploader from "@/components/equipment/EquipmentPhotoUploader";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses, Field, Input, Textarea } from "@/components/ui/Field";
import PageHeader from "@/components/ui/PageHeader";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  EQUIPMENT_STATUSES,
  equipmentName,
  equipmentPhotoUrl
} from "@/lib/equipment";
import { updateEquipment } from "../actions";

const STATUS_KEY = {
  IN_INVENTORY: "statusInInventory",
  SIGNED_OUT: "statusSignedOut",
  MAINTENANCE: "statusMaintenance",
  BROKEN: "statusBroken",
  OTHER: "statusOther"
} as const;

export default async function EditEquipmentPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, locale, t] = await Promise.all([
    params,
    getLocale(),
    getTranslations("equipment")
  ]);
  const user = await requireUser(locale);
  const [item, categories] = await Promise.all([
    prisma.equipmentItem.findFirst({
      where: { id, ownerId: user.id },
      include: { category: { select: { name: true } } }
    }),
    prisma.equipmentCategory.findMany({
      where: { ownerId: user.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true }
    })
  ]);
  if (!item) notFound();

  const displayName = equipmentName(item);
  const photoUrl = equipmentPhotoUrl(item.photoToken);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title={displayName}
        description={t("editEquipmentHint")}
        action={
          <Link href="/dashboard/equipment" className={buttonClasses()}>
            {t("backToInventory")}
          </Link>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="ui-panel p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold">{t("equipmentDetails")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("equipmentDetailsHint")}</p>

          <form action={updateEquipment} className="mt-5 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="id" value={item.id} />
            <Field label={t("brand")} htmlFor="equipment-brand" required>
              <Input
                id="equipment-brand"
                name="brand"
                required
                maxLength={100}
                defaultValue={item.brand}
              />
            </Field>
            <Field label={t("model")} htmlFor="equipment-model" required>
              <Input
                id="equipment-model"
                name="model"
                required
                maxLength={160}
                defaultValue={item.model}
              />
            </Field>
            <Field label={t("category")} htmlFor="equipment-category" required>
              <select
                id="equipment-category"
                name="categoryId"
                required
                defaultValue={item.categoryId}
                className={controlClasses}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t("status")} htmlFor="equipment-status" required>
              <select
                id="equipment-status"
                name="status"
                defaultValue={item.status}
                className={controlClasses}
              >
                {EQUIPMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>{t(STATUS_KEY[status])}</option>
                ))}
              </select>
            </Field>
            <Field label={t("serialNumber")} htmlFor="equipment-serial">
              <Input
                id="equipment-serial"
                name="serialNumber"
                maxLength={160}
                defaultValue={item.serialNumber}
              />
            </Field>
            <Field
              label={t("statusNote")}
              htmlFor="equipment-status-note"
              hint={t("statusNoteHint")}
              className="sm:col-span-2"
            >
              <Textarea
                id="equipment-status-note"
                name="statusNote"
                rows={2}
                maxLength={1000}
                defaultValue={item.statusNote}
              />
            </Field>
            <Field
              label={t("notes")}
              htmlFor="equipment-notes"
              className="sm:col-span-2"
            >
              <Textarea
                id="equipment-notes"
                name="notes"
                rows={4}
                maxLength={2000}
                defaultValue={item.notes}
              />
            </Field>
            <button
              type="submit"
              className={buttonClasses({
                variant: "primary",
                className: "sm:col-span-2 sm:justify-self-start"
              })}
            >
              {t("saveEquipment")}
            </button>
          </form>
        </section>

        <aside className="ui-panel p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold">{t("equipmentPhoto")}</h2>
          <p className="mt-1 text-sm text-fg-subtle">{t("photoHint")}</p>
          <div className="mt-5">
            <EquipmentPhotoUploader
              equipmentId={item.id}
              currentUrl={photoUrl}
              name={displayName}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
