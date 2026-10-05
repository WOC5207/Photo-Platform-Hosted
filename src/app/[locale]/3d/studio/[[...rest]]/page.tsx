import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth";

/**
 * /3d/studio/… is the Dashboard of whoever is signed in. Links that can't
 * name the photographer (the classic dashboard's switch, the 3D login) come
 * here and go on to /3d/u/<username>/studio/….
 */
export default async function StudioForward({
  params,
  searchParams
}: {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { rest = [] } = await params;
  // Filters such as ?event= ride along.
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(await searchParams)) {
    for (const one of [value ?? []].flat()) query.append(name, one);
  }
  const locale = await getLocale();
  const user = await getCurrentUser();
  if (!user) redirect(`/${locale}/3d/login`);
  const tail = rest.map(encodeURIComponent).join("/");
  redirect(`/${locale}/3d/u/${encodeURIComponent(user.username)}/studio${tail ? `/${tail}` : ""}${query.size ? `?${query}` : ""}`);
}
