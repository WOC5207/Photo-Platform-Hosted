import type { EquipmentChecklistState } from "@prisma/client";
import QuickEquipmentStatusButton from "@/components/equipment/QuickEquipmentStatusButton";
import { QUICK_EQUIPMENT_STATUSES } from "@/lib/equipment";
import { setChecklistEquipmentStatus } from "./actions";
import StatusSegmentedControl from "@/components/equipment/StatusSegmentedControl";

export default function ChecklistEquipmentStatus({
  checklistId,
  equipmentId,
  state,
  label,
  labels
}: {
  checklistId: string;
  equipmentId: string;
  state: EquipmentChecklistState;
  label: string;
  labels: {
    group: string;
    atEvent: string;
    returned: string;
    broken: string;
  };
}) {
  const choiceLabels = {
    SIGNED_OUT: labels.atEvent,
    IN_INVENTORY: labels.returned,
    BROKEN: labels.broken
  } as const;

  return (
    <form action={setChecklistEquipmentStatus}>
      <input type="hidden" name="checklistId" value={checklistId} />
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <StatusSegmentedControl label={`${labels.group}: ${label}`}>
        {QUICK_EQUIPMENT_STATUSES.map((choice) => (
          <QuickEquipmentStatusButton
            key={choice}
            status={choice}
            active={
              (choice === "SIGNED_OUT" && state === "AT_EVENT") ||
              (choice === "IN_INVENTORY" && state === "RETURNED") ||
              (choice === "BROKEN" && state === "BROKEN")
            }
            label={choiceLabels[choice]}
          />
        ))}
      </StatusSegmentedControl>
    </form>
  );
}
