"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { addEquipmentCategory } from "@/app/[locale]/dashboard/(protected)/equipment/actions";
import { EQUIPMENT_STATUSES, equipmentName } from "@/lib/equipment";
import { fieldClass, primaryClass, secondaryClass, useScene } from "../booking/shared";
import { GEAR_CARD_ASPECT, STATUS_KEY, paintGearCard, useImages, useQrImage } from "./gear";
import type { StudioGear, StudioGearCategory, StudioGearStatus } from "./types";

/** The category list's last entry, which opens the new-category field. */
const ADD_CATEGORY = "__add-category";

/** What the equipment form edits, kept by the screen so the easel follows it. */
export interface GearDraft {
  brand: string;
  model: string;
  categoryId: string;
  status: StudioGearStatus;
  statusNote: string;
  serialNumber: string;
  notes: string;
}

export const blankGear: GearDraft = { brand: "", model: "", categoryId: "", status: "IN_INVENTORY", statusNote: "", serialNumber: "", notes: "" };

export function draftOf(gear: StudioGear): GearDraft {
  const { brand, model, categoryId, status, statusNote, serialNumber, notes } = gear;
  return { brand, model, categoryId, status, statusNote, serialNumber, notes };
}

/** The draft's ID card on the easel, repainted as the form changes. */
export function useGearCard(draft: GearDraft, categories: StudioGearCategory[], photoUrl: string, qrToken: string) {
  const te = useTranslations("equipment");
  const locale = useLocale();
  const scene = useScene("case");
  const image = useImages();
  const qr = useQrImage(locale, qrToken);
  useEffect(() => {
    if (!scene) return;
    const canvas = scene.setPoster(`gear-edit:${qrToken || "new"}`, GEAR_CARD_ASPECT, 1400);
    const name = equipmentName({ name: "", brand: draft.brand, model: draft.model }) || te("newEquipmentTitle");
    paintGearCard(
      canvas,
      {
        ...draft,
        name,
        category: categories.find((c) => c.id === draft.categoryId)?.name ?? te("chooseCategory"),
        qrToken: qrToken || "--------"
      },
      { photo: image(photoUrl), qr, accent: scene.accent(), status: te(STATUS_KEY[draft.status]), serial: te("serialShort"), noPhoto: te("noPhoto") }
    );
    scene.refresh();
  }, [scene, draft, categories, photoUrl, qrToken, qr, image, te]);
}

/** Brand, model, category, status and the rest, as the classic equipment form has them. */
export function GearForm({
  draft,
  onChange,
  categories,
  onSubmit,
  pending,
  submitLabel,
  children
}: {
  draft: GearDraft;
  onChange: (next: GearDraft) => void;
  categories: StudioGearCategory[];
  onSubmit: (data: FormData) => void;
  pending: boolean;
  submitLabel: string;
  /** Extra fields before the submit button (the new item's photo). */
  children?: ReactNode;
}) {
  const t = useTranslations("album3d");
  const tc = useTranslations("common");
  const te = useTranslations("equipment");
  const label = "grid gap-1 text-sm font-semibold text-fg-muted";
  const set = <K extends keyof GearDraft>(name: K, value: GearDraft[K]) => onChange({ ...draft, [name]: value });

  // "Add category" at the end of the category list opens a name field here,
  // so a missing category doesn't cost the photographer the form.
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, startCreating] = useTransition();
  const [failed, setFailed] = useState(false);
  // Shown until the refreshed list arrives with the new category in it.
  const [added, setAdded] = useState<StudioGearCategory[]>([]);
  const options = [...categories, ...added.filter((a) => !categories.some((c) => c.id === a.id))];
  const createCategory = () => {
    const name = newName.trim();
    if (!name || creating) return;
    const data = new FormData();
    data.set("name", name);
    setFailed(false);
    startCreating(async () => {
      const created = await addEquipmentCategory(data).catch(() => ({ id: undefined, name: undefined }));
      if (!created.id) {
        setFailed(true);
        return;
      }
      setAdded((list) => [...list, { id: created.id!, name: created.name ?? name, count: 0 }]);
      onChange({ ...draft, categoryId: created.id });
      setAdding(false);
      setNewName("");
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(new FormData(e.currentTarget));
      }}
      aria-busy={pending}
      className="mt-6 grid gap-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {te("brand")}
          <input name="brand" required maxLength={100} value={draft.brand} onChange={(e) => set("brand", e.target.value)} className={fieldClass} />
        </label>
        <label className={label}>
          {te("model")}
          <input name="model" required maxLength={160} value={draft.model} onChange={(e) => set("model", e.target.value)} className={fieldClass} />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {te("category")}
          <select
            name="categoryId"
            required
            value={adding ? ADD_CATEGORY : draft.categoryId}
            onChange={(e) => {
              const next = e.target.value === ADD_CATEGORY;
              setAdding(next);
              setFailed(false);
              if (!next) set("categoryId", e.target.value);
            }}
            className={fieldClass}
          >
            <option value="" disabled>
              {te("chooseCategory")}
            </option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value={ADD_CATEGORY}>{t("studioAddCategory")}</option>
          </select>
        </label>
        <label className={label}>
          {te("status")}
          <select name="status" value={draft.status} onChange={(e) => set("status", e.target.value as StudioGearStatus)} className={fieldClass}>
            {EQUIPMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {te(STATUS_KEY[s])}
              </option>
            ))}
          </select>
        </label>
      </div>
      {adding && (
        <div className="grid gap-2 border-l-2 border-accent pl-3">
          <label className={label}>
            {te("categoryName")}
            <input
              autoFocus
              maxLength={100}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                // Enter makes the category, not the equipment.
                if (e.key === "Enter") {
                  e.preventDefault();
                  createCategory();
                }
              }}
              className={fieldClass}
            />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={creating || !newName.trim()} onClick={createCategory} className={secondaryClass}>
              {creating ? te("savingEquipment") : te("createCategory")}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFailed(false);
              }}
              className={`${secondaryClass} text-xs`}
            >
              {tc("cancel")}
            </button>
          </div>
          {failed && <p className="text-sm text-danger">{t("studioCategoryError")}</p>}
        </div>
      )}
      <label className={label}>
        {te("serialNumber")}
        <input name="serialNumber" maxLength={160} value={draft.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} className={fieldClass} />
      </label>
      <label className={label}>
        {te("statusNote")}
        <textarea name="statusNote" rows={2} maxLength={1000} value={draft.statusNote} onChange={(e) => set("statusNote", e.target.value)} className={fieldClass} />
        <span className="text-xs font-normal text-fg-subtle">{te("statusNoteHint")}</span>
      </label>
      <label className={label}>
        {te("notes")}
        <textarea name="notes" rows={3} maxLength={2000} value={draft.notes} onChange={(e) => set("notes", e.target.value)} className={fieldClass} />
      </label>
      {children}
      <button type="submit" disabled={pending || adding || options.length === 0} className={primaryClass}>
        {pending ? te("savingEquipment") : submitLabel}
        <span aria-hidden="true" className="text-lg">→</span>
      </button>
      {options.length === 0 && !adding && <p className="text-sm text-fg-subtle">{te("createCategoryFirst")}</p>}
    </form>
  );
}
