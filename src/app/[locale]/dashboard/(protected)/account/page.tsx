import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const locale = await getLocale();
  redirect(`/${locale}/dashboard/settings?section=profile`);
}
