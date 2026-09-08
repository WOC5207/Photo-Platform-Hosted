import type { EquipmentStatus } from "@prisma/client";
import QuickEquipmentStatusButton from "@/components/equipment/QuickEquipmentStatusButton";
import { QUICK_EQUIPMENT_STATUSES } from "@/lib/equipment";
import { setChecklistEquipmentStatus } from "./actions";

export default function ChecklistEquipmentStatus({
  checklistId,
  equipmentId,
  status,
  label,
  labels
}: {
  checklistId: string;
  equipmentId: string;
  status: EquipmentStatus;
  label: string;
  labels: {
    group: string;
    signedOut: string;
    inInventory: string;
    broken: string;
  };
}) {
  const choiceLabels = {
    SIGNED_OUT: labels.signedOut,
    IN_INVENTORY: labels.inInventory,
    BROKEN: labels.broken
  } as const;

  return (
    <form
      action={setChecklistEquipmentStatus}
      className="flex flex-wrap gap-1 rounded-lg bg-surface p-1"
      role="group"
      aria-label={`${labels.group}: ${label}`}
    >
      <input type="hidden" name="checklistId" value={checklistId} />
      <input type="hidden" name="equipmentId" value={equipmentId} />
      {QUICK_EQUIPMENT_STATUSES.map((choice) => (
        <QuickEquipmentStatusButton
          key={choice}
          status={choice}
          active={status === choice}
          label={choiceLabels[choice]}
        />
      ))}
    </form>
  );
}
