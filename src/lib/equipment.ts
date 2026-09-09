import type { EquipmentStatus } from "@prisma/client";

export const EQUIPMENT_STATUSES = [
  "IN_INVENTORY",
  "SIGNED_OUT",
  "MAINTENANCE",
  "BROKEN",
  "OTHER"
] as const satisfies readonly EquipmentStatus[];

export const QUICK_EQUIPMENT_STATUSES = [
  "SIGNED_OUT",
  "IN_INVENTORY",
  "BROKEN"
] as const satisfies readonly EquipmentStatus[];

export type QuickEquipmentStatus = (typeof QUICK_EQUIPMENT_STATUSES)[number];

export function equipmentName(item: {
  name: string;
  brand?: string | null;
  model?: string | null;
}): string {
  return [item.brand?.trim(), item.model?.trim()].filter(Boolean).join(" ") || item.name;
}

export function equipmentPhotoUrl(token: string): string {
  return token ? `/api/admin/equipment-image/${token}.webp` : "";
}
