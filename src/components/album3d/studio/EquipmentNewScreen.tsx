"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createEquipment } from "@/app/[locale]/dashboard/(protected)/equipment/actions";
import { uploadEquipmentPhoto } from "@/components/equipment/EquipmentPhotoUploader";
import { BookingPanel, fieldClass, useStage } from "../booking/shared";
import { GearForm, blankGear, useGearCard } from "./GearForm";
import { ClassicLink, FormNote, StudioHeading } from "./shared";
import type { StudioAccount, StudioGearCategory } from "./types";

/**
 * Adding a piece of equipment: the blank ID card on the easel fills in as
 * the form does. Once saved (with its photo, if one was chosen) the new
 * item's editor opens, or the label sheet when the photographer came from it.
 */
export default function EquipmentNewScreen({
  account,
  categories,
  forLabels
}: {
  account: StudioAccount;
  categories: StudioGearCategory[];
  /** Came from the label sheet: go back to it with the new item on the sheet. */
  forLabels: boolean;
}) {
  const t = useTranslations("album3d");
  const te = useTranslations("equipment");
  const { go, path } = useStage();
  const router = useRouter();
  const { username } = account;
  const [draft, setDraft] = useState(blankGear);
  const [pending, startSaving] = useTransition();
  const [error, setError] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  // The chosen photo goes on the card before it is uploaded (a TIFF the
  // browser can't draw just leaves the card's photo blank).
  const [photoUrl, setPhotoUrl] = useState("");
  useEffect(() => {
    if (!photo) return setPhotoUrl("");
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  useGearCard(draft, categories, photoUrl, "");

  const save = (data: FormData) => {
    const file = data.get("photo");
    data.delete("photo");
    setError(false);
    startSaving(async () => {
      const created = await createEquipment(data).catch(() => ({ id: undefined }));
      if (!created.id) {
        setError(true);
        return;
      }
      // The item exists either way; a failed photo can be added in its editor.
      if (file instanceof File && file.size > 0) await uploadEquipmentPhoto(created.id, file).catch(() => undefined);
      if (forLabels) router.push(`${path({ kind: "studio", username, page: "labels" })}?selected=${encodeURIComponent(created.id)}`);
      else go({ kind: "studio", username, page: "equipmentItem", id: created.id });
    });
  };

  return (
    <BookingPanel expanded>
      <StudioHeading trail={t("studioEquipment")} title={te("newEquipmentTitle")} />
      <p className="mt-4 text-sm text-fg-muted">{te("addEquipmentHint")}</p>
      {categories.length === 0 && (
        <Link href={path({ kind: "studio", username, page: "categories" })} scroll={false} className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">
          {te("manageCategories")} →
        </Link>
      )}
      <GearForm draft={draft} onChange={setDraft} categories={categories} onSubmit={save} pending={pending} submitLabel={te("addEquipmentButton")}>
        <label className="grid gap-1 text-sm font-semibold text-fg-muted">
          {te("photoOptional")}
          <input
            name="photo"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/tiff,image/x-tiff,.tif,.tiff"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
            className={`${fieldClass} file:mr-3 file:border-0 file:bg-transparent file:font-semibold`}
          />
          <span className="text-xs font-normal text-fg-subtle">{photo?.name || te("photoHint")}</span>
        </label>
        {error && <FormNote tone="error">{te("equipmentSaveError")}</FormNote>}
      </GearForm>
      <ClassicLink href="/dashboard/equipment/new" />
    </BookingPanel>
  );
}
