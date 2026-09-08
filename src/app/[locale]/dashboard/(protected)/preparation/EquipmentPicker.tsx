"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { EquipmentStatus } from "@prisma/client";
import { controlClasses } from "@/components/ui/Field";
import { addSelectedEquipment } from "./actions";
import SubmitButton from "./SubmitButton";

const STATUS_KEY = {
  IN_INVENTORY: "statusInInventory",
  SIGNED_OUT: "quickStatusSignedOut",
  MAINTENANCE: "statusMaintenance",
  BROKEN: "statusBroken",
  OTHER: "statusOther"
} as const;

const STATUS_CLASS = {
  IN_INVENTORY: "border-success-border bg-success-surface text-success-strong",
  SIGNED_OUT: "border-accent/25 bg-accent-surface text-accent",
  MAINTENANCE: "border-danger-border bg-danger-surface text-danger-strong",
  BROKEN: "border-danger-border bg-danger-surface text-danger-strong",
  OTHER: "border-border-strong bg-surface-2 text-fg-muted"
} as const;

export default function EquipmentPicker({ checklistId, equipment, selectedIds }: {
  checklistId: string;
  equipment: {
    id: string;
    name: string;
    categoryId: string;
    category: string;
    status: EquipmentStatus;
  }[];
  selectedIds: string[];
}) {
  const t = useTranslations("preparation");
  const te = useTranslations("equipment");
  const [chosen, setChosen] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState("all");
  const available = equipment.filter((item) => !selectedIds.includes(item.id));
  const visible = categoryId === "all"
    ? available
    : available.filter((item) => item.categoryId === categoryId);
  const count = chosen.filter((id) => available.some((item) => item.id === id)).length;
  const categories = useMemo(() => {
    const unique = new Map<string, string>();
    available.forEach((item) => unique.set(item.categoryId, item.category));
    return [...unique.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [available]);

  return (
    <section className="flex flex-col gap-4" aria-labelledby={`picker-${checklistId}`}>
      <div>
        <h3 id={`picker-${checklistId}`} className="font-display text-xl font-semibold">
          {t("pickEquipment")}
        </h3>
        <p className="mt-1 text-sm text-fg-subtle">{t("pickHint")}</p>
      </div>

      {available.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-sm text-fg-subtle">
          {equipment.length ? t("allSelected") : t("noEquipment")}
        </p>
      ) : (
        <form action={addSelectedEquipment} className="flex flex-col gap-4">
          <input type="hidden" name="checklistId" value={checklistId} />
          <label className="flex flex-col gap-2 text-sm">
            <span className="font-semibold text-fg-muted">{t("categoryFilter")}</span>
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={controlClasses}
            >
              <option value="all">{t("allCategories")}</option>
              {categories.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>

          {visible.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-sm text-fg-subtle">
              {t("noEquipmentInCategory")}
            </p>
          ) : (
            <fieldset className="flex max-h-[28rem] flex-col gap-2 overflow-y-auto pr-1">
              <legend className="sr-only">{t("pickHint")}</legend>
              {visible.map((item) => (
                <label
                  key={item.id}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border bg-control px-3 py-2 transition-colors hover:border-border-strong"
                >
                  <input
                    type="checkbox"
                    name="equipmentIds"
                    value={item.id}
                    checked={chosen.includes(item.id)}
                    onChange={(event) => setChosen((ids) => event.target.checked
                      ? [...ids, item.id]
                      : ids.filter((id) => id !== item.id))}
                    className="h-5 w-5 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 flex-1 break-words text-sm">
                    <span className="block font-semibold">{item.name}</span>
                    <span className="text-xs text-fg-subtle">{item.category}</span>
                  </span>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[0.625rem] font-semibold ${STATUS_CLASS[item.status]}`}>
                    {te(STATUS_KEY[item.status])}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <SubmitButton disabled={count === 0} primary>
            {t("addSelected", { count })}
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
