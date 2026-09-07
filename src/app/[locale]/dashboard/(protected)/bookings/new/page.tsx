import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";

export default async function NewBookingEventPage() {
  redirect("/" + await getLocale() + "/dashboard/events/new");
}
