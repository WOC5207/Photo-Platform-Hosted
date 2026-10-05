import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import ChecklistScreen from "@/components/album3d/studio/ChecklistScreen";
import { requireStudioUser, studioAccount } from "@/lib/studio3d";
import { loadStudioChecklist } from "@/lib/studioGear3d";

export const dynamic = "force-dynamic";

export default async function StudioChecklistPage({ params }: { params: Promise<{ username: string; id: string }> }) {
  const { username, id } = await params;
  const locale = await getLocale();
  const user = await requireStudioUser(username, locale);
  const checklist = await loadStudioChecklist(user, id, locale);
  if (!checklist) notFound();
  return <ChecklistScreen account={studioAccount(user)} checklist={checklist} />;
}
