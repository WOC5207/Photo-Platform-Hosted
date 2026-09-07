"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addSelectedEquipment } from "./actions";
import SubmitButton from "./SubmitButton";

export default function EquipmentPicker({ checklistId, equipment, selectedIds }: {
  checklistId: string;
  equipment: { id: string; name: string; category: string }[];
  selectedIds: string[];
}) {
  const t = useTranslations("preparation");
  const [chosen, setChosen] = useState<string[]>([]);
  const available = equipment.filter(item => !selectedIds.includes(item.id));
  const count = chosen.filter(id => available.some(item => item.id === id)).length;
  return <details className="rounded-lg border border-border bg-control p-3">
    <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">{t("pickEquipment")}</summary>
    {available.length === 0 ? <p className="py-3 text-sm text-fg-subtle">{equipment.length ? t("allSelected") : t("noEquipment")}</p> :
      <form action={addSelectedEquipment} className="flex flex-col gap-4 pt-3">
        <input type="hidden" name="checklistId" value={checklistId} />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-fg-muted">{t("pickHint")}</legend>
          {available.map(item => <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-surface px-3 py-2">
            <input type="checkbox" name="equipmentIds" value={item.id} checked={chosen.includes(item.id)}
              onChange={e => setChosen(ids => e.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id))}
              className="h-5 w-5 shrink-0 accent-accent" />
            <span className="min-w-0 break-words text-sm"><span className="block font-medium">{item.name}</span><span className="text-xs text-fg-subtle">{item.category}</span></span>
          </label>)}
        </fieldset>
        <SubmitButton disabled={count === 0} primary>{t("addSelected", { count })}</SubmitButton>
      </form>}
  </details>;
}
