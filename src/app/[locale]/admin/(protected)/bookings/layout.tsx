import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/settings";

export default async function BookingsLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const user = await requireUser(locale);
  const settings = await getSiteSettings(user.id);
  if (!settings.bookingEnabled) {
    redirect(`/${locale}/admin`);
  }
  return children;
}
