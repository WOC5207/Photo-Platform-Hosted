"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

/**
 * Close the first-login tutorial for the signed-in account, whether it was
 * finished or skipped. Stored on the account rather than in the browser so it
 * holds across devices, and idempotent so the client can call it optimistically.
 */
export async function completeOnboardingTour(): Promise<void> {
  const user = await requireUser(await getLocale());
  await prisma.user.updateMany({
    where: { id: user.id, tourCompletedAt: null },
    data: { tourCompletedAt: new Date() }
  });
  revalidatePath("/", "layout");
}

/** Bring the tutorial back from the Overview page; it restarts at step one. */
export async function restartOnboardingTour(): Promise<void> {
  const user = await requireUser(await getLocale());
  await prisma.user.update({
    where: { id: user.id },
    data: { tourCompletedAt: null }
  });
  revalidatePath("/", "layout");
}
