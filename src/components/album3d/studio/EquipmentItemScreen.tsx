"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { removeEquipmentPhoto, updateEquipment } from "@/app/[locale]/dashboard/(protected)/equipment/actions";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { uploadEquipmentPhoto } from "@/components/equipment/EquipmentPhotoUploader";
import { BookingPanel, metaLabel, secondaryClass } from "../booking/shared";
import { GearForm, draftOf, useGearCard } from "./GearForm";
import { FormNote, StudioHeading } from "./shared";
import type { StudioGear, StudioGearCategory } from "./types";

/**
 * One piece of equipment's editor: its ID card stands on the easel and
 * follows the form as it is filled in, and its reference photo is added,
 * replaced or removed beside it. Saving goes through the classic action.
 */
export default function EquipmentItemScreen({ gear, categories }: { gear: StudioGear; categories: StudioGearCategory[] }) {
  const t = useTranslations("album3d");
  const te = useTranslations("equipment");
  const router = useRouter();
  const [draft, setDraft] = useState(() => draftOf(gear));
  const [saving, startSaving] = useTransition();
  const [saved, setSaved] = useState(false);
  const [photo, setPhoto] = useState<"idle" | "busy" | "saved" | "tooLarge" | "quotaExceeded" | "error">("idle");
  const fileRef = useRef<HTMLInputElement>(null);
  useGearCard(draft, categories, gear.photoUrl, gear.qrToken);

  const save = (data: FormData) => {
    data.set("id", gear.id);
    setSaved(false);
    startSaving(async () => {
      await updateEquipment(data);
      setSaved(true);
    });
  };

  async function upload(file: File | undefined) {
    if (!file) return;
    setPhoto("busy");
    try {
      await uploadEquipmentPhoto(gear.id, file);
      setPhoto("saved");
      router.refresh();
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setPhoto(reason === "tooLarge" || reason === "quotaExceeded" ? reason : "error");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <BookingPanel expanded>
      <StudioHeading trail={t("studioEquipment")} title={gear.name} />
      <GearForm
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setSaved(false);
        }}
        categories={categories}
        onSubmit={save}
        pending={saving}
        submitLabel={te("saveEquipment")}
      >
        {saved && !saving && <FormNote tone="ok">{t("studioSaved")}</FormNote>}
      </GearForm>

      <section aria-labelledby="studio-gear-photo" className="mt-8 grid gap-3 border-t border-border pt-5" aria-busy={photo === "busy"}>
        <h2 id="studio-gear-photo" className={metaLabel}>
          {te("equipmentPhoto")}
        </h2>
        <p className="text-xs text-fg-subtle">{te("photoHint")}</p>
        <div className="flex flex-wrap gap-2">
          <label className={`${secondaryClass} cursor-pointer focus-within:ring-2 focus-within:ring-accent/40`}>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/tiff,image/x-tiff,.tif,.tiff"
              disabled={photo === "busy"}
              onChange={(e) => void upload(e.target.files?.[0])}
              className="sr-only"
            />
            {photo === "busy" ? te("photoUploading") : gear.photoUrl ? te("replacePhoto") : te("uploadPhoto")}
          </label>
          {gear.photoUrl && (
            <form action={removeEquipmentPhoto}>
              <input type="hidden" name="id" value={gear.id} />
              <ConfirmSubmit label={te("removePhoto")} confirmText={te("removePhotoConfirm", { name: gear.name })} />
            </form>
          )}
        </div>
        {photo === "saved" && <FormNote tone="ok">{te("photoSaved")}</FormNote>}
        {photo === "tooLarge" && <FormNote tone="error">{te("photoTooLarge")}</FormNote>}
        {photo === "quotaExceeded" && <FormNote tone="error">{te("photoQuotaExceeded")}</FormNote>}
        {photo === "error" && <FormNote tone="error">{te("photoUploadError")}</FormNote>}
      </section>
    </BookingPanel>
  );
}
