"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";

const FINAL_STATUSES = new Set(["resolved", "dismissed"]);

/**
 * Claim or close a visitor report.
 *
 * The conditional update is intentional: two administrators may have the
 * queue open at once, but a closed report must never be silently overwritten
 * by the second form submission. The reporter's OpenID is not selected or
 * exposed by the admin UI.
 */
export async function updateContentReport(formData: FormData): Promise<void> {
  const admin = await requireAdmin(await getLocale());
  const id = formData.get("id");
  const status = formData.get("status");
  const rawNote = formData.get("note");
  const resolutionNote =
    typeof rawNote === "string" ? rawNote.trim().slice(0, 2000) : "";

  if (
    typeof id !== "string" ||
    typeof status !== "string" ||
    (status !== "reviewing" && !FINAL_STATUSES.has(status))
  ) {
    return;
  }
  if (FINAL_STATUSES.has(status) && resolutionNote.length === 0) return;

  await prisma.contentReport.updateMany({
    where: {
      id,
      status: { in: ["pending", "reviewing"] },
    },
    data: {
      status,
      reviewedById: admin.id,
      resolutionNote,
      resolvedAt: FINAL_STATUSES.has(status) ? new Date() : null,
    },
  });

  revalidatePath("/", "layout");
}
