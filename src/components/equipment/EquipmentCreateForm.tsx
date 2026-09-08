"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createEquipment } from "@/app/[locale]/dashboard/(protected)/equipment/actions";
import { uploadEquipmentPhoto } from "./EquipmentPhotoUploader";
import { buttonClasses } from "@/components/ui/Button";
import { controlClasses, Field, Input, Textarea } from "@/components/ui/Field";
import StatusMessage from "@/components/ui/StatusMessage";

export default function EquipmentCreateForm({ categories }: {
  categories: { id: string; name: string }[];
}) {
  const t = useTranslations("equipment");
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"idle" | "saved" | "partial" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const photo = data.get("photo");
    data.delete("photo");
    setBusy(true);
    setResult("idle");
    try {
      const created = await createEquipment(data);
      if (!created.id) {
        setResult("error");
        return;
      }
      formRef.current?.reset();
      if (photo instanceof File && photo.size > 0) {
        try {
          await uploadEquipmentPhoto(created.id, photo);
        } catch {
          setResult("partial");
          router.refresh();
          return;
        }
      }
      setResult("saved");
      router.refresh();
    } catch {
      setResult("error");
    } finally {
      setBusy(false);
    }
  }

  return <form ref={formRef} onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2" aria-busy={busy}>
    <Field label={t("brand")} htmlFor="equipment-brand" required>
      <Input id="equipment-brand" name="brand" required maxLength={100} autoComplete="organization" />
    </Field>
    <Field label={t("model")} htmlFor="equipment-model" required>
      <Input id="equipment-model" name="model" required maxLength={160} />
    </Field>
    <Field label={t("category")} htmlFor="equipment-category" required>
      <select id="equipment-category" name="categoryId" required disabled={!categories.length || busy} defaultValue="" className={controlClasses}>
        <option value="" disabled>{t("chooseCategory")}</option>
        {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
      </select>
    </Field>
    <Field label={t("status")} htmlFor="equipment-status" required>
      <select id="equipment-status" name="status" defaultValue="IN_INVENTORY" className={controlClasses}>
        <option value="IN_INVENTORY">{t("statusInInventory")}</option>
        <option value="SIGNED_OUT">{t("statusSignedOut")}</option>
        <option value="MAINTENANCE">{t("statusMaintenance")}</option>
        <option value="BROKEN">{t("statusBroken")}</option>
        <option value="OTHER">{t("statusOther")}</option>
      </select>
    </Field>
    <Field label={t("serialNumber")} htmlFor="equipment-serial">
      <Input id="equipment-serial" name="serialNumber" maxLength={160} />
    </Field>
    <Field label={t("photoOptional")} htmlFor="equipment-photo" hint={t("photoHint")}>
      <Input id="equipment-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/tiff,image/x-tiff,.tif,.tiff" />
    </Field>
    <Field label={t("statusNote")} htmlFor="equipment-status-note" hint={t("statusNoteHint")} className="sm:col-span-2">
      <Textarea id="equipment-status-note" name="statusNote" rows={2} maxLength={1000} />
    </Field>
    <Field label={t("notes")} htmlFor="equipment-notes" className="sm:col-span-2">
      <Textarea id="equipment-notes" name="notes" rows={3} maxLength={2000} />
    </Field>
    <button type="submit" disabled={!categories.length || busy} className={buttonClasses({ variant: "primary", className: "sm:col-span-2 sm:justify-self-start" })}>
      {busy ? t("savingEquipment") : t("addEquipmentButton")}
    </button>
    {!categories.length && <p className="text-sm text-fg-subtle sm:col-span-2">{t("createCategoryFirst")}</p>}
    <div className="sm:col-span-2" aria-live="polite">
      {result === "saved" && <StatusMessage kind="success">{t("equipmentSaved")}</StatusMessage>}
      {result === "partial" && <StatusMessage kind="info">{t("equipmentSavedPhotoFailed")}</StatusMessage>}
      {result === "error" && <StatusMessage kind="error">{t("equipmentSaveError")}</StatusMessage>}
    </div>
  </form>;
}
