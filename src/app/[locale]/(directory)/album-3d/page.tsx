import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

// The prototype's address, kept for old links: the archive now lives in the
// 3D site.
export default async function AlbumArchiveRedirect() {
  redirect({ href: "/3d/albums", locale: await getLocale() });
}
