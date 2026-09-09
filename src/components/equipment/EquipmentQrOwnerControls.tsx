"use client";

import type { EquipmentStatus } from "@prisma/client";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";
import QuickEquipmentStatusButton from "@/components/equipment/QuickEquipmentStatusButton";
import { QUICK_EQUIPMENT_STATUSES } from "@/lib/equipment";
import {
  updateEquipmentQrStatus,
  type EquipmentQrStatusState
} from "@/app/[locale]/equipment/[token]/actions";

const STATUS_KEY = {
  IN_INVENTORY: "statusInInventory",
  SIGNED_OUT: "quickStatusSignedOut",
  MAINTENANCE: "statusMaintenance",
  BROKEN: "statusBroken",
  OTHER: "statusOther"
} as const;

const ERROR_KEY = {
  unauthorized: "qrStatusUnauthorized",
  forbidden: "qrStatusForbidden",
  invalid: "qrStatusInvalid",
  missing: "qrStatusMissing",
  failed: "qrStatusFailed"
} as const;

export default function EquipmentQrOwnerControls({
  equipmentId,
  token,
  initialStatus
}: {
  equipmentId: string;
  token: string;
  initialStatus: EquipmentStatus;
}) {
  const t = useTranslations("equipment");
  const initial: EquipmentQrStatusState = { status: initialStatus };
  const [state, action, pending] = useActionState(updateEquipmentQrStatus, initial);

  return (
    <section aria-labelledby="equipment-owner-tools" className="mt-8 rounded-xl border border-border bg-control p-4 sm:p-5">
      <p className="font-meta text-[0.6875rem] font-semibold uppercase tracking-[0.16em] text-accent">
        {t("ownerToolsMarker")}
      </p>
      <h2 id="equipment-owner-tools" className="font-display mt-2 text-xl font-semibold tracking-tight text-fg">
        {t("ownerToolsTitle")}
      </h2>
      <p className="mt-2 text-sm leading-6 text-fg-muted">{t("ownerToolsHint")}</p>
      <p className="mt-4 text-sm font-medium text-fg">
        {t("currentStatus")}: <span className="font-semibold">{t(STATUS_KEY[state.status])}</span>
      </p>
      <form action={action} className="mt-3">
        <input type="hidden" name="token" value={token} />
        <div role="group" aria-label={t("setInventoryStatus")} className="flex flex-wrap gap-1 rounded-lg bg-surface p-1">
          {QUICK_EQUIPMENT_STATUSES.map((status) => (
            <QuickEquipmentStatusButton
              key={status}
              status={status}
              active={state.status === status}
              label={t(STATUS_KEY[status])}
              disabled={pending}
            />
          ))}
        </div>
      </form>
      <div className="mt-3 min-h-5" aria-live="polite">
        {pending && <p className="text-sm text-fg-muted">{t("qrStatusWorking")}</p>}
        {!pending && state.saved && !state.error && <p role="status" className="text-sm text-success">{t("qrStatusSaved")}</p>}
        {!pending && state.error && <p role="alert" className="text-sm text-danger">{t(ERROR_KEY[state.error])}</p>}
      </div>
      <Link href={`/dashboard/equipment/${equipmentId}`} className={buttonClasses({ className: "mt-3" })}>
        {t("editEquipment")}
      </Link>
    </section>
  );
}
