"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import type { SlotEditorProps } from "./SlotEditForm";

export type { EditableSlot } from "./SlotEditForm";

// The form only loads once opened, keeping it off the schedule's first load.
const SlotEditForm = dynamic(() => import("./SlotEditForm"));

/**
 * Change a slot after it was made, booked or not: its day, start and end,
 * seats, price and label. Shared by the classic schedule tab and the new
 * site's Dashboard.
 */
export default function SlotEditor(props: SlotEditorProps) {
  const t = useTranslations("adminBookings");
  const [open, setOpen] = useState(false);

  return open ? (
    <SlotEditForm {...props} onClose={() => setOpen(false)} />
  ) : (
    <Button
      type="button"
      size="compact"
      onClick={() => setOpen(true)}
      aria-expanded={false}
      className="self-start"
    >
      {t("editSlot")}
    </Button>
  );
}
