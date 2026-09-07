import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

export default async function PreparationPage() {
  redirect(`/${await getLocale()}/dashboard/preparation/slots`);
}
