import { notFound } from "next/navigation";
import { archiveHasScreen } from "@/lib/archive3d";

// The /3d layout draws this screen from the address; this answers 404 where it shows "File not found".
export default async function ThreeDScreen({ params }: { params: Promise<{ username: string; slug: string; photo: string }> }) {
  if (!(await archiveHasScreen(await params))) notFound();
  return null;
}
