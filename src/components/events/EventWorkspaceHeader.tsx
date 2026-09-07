import { getTranslations } from "next-intl/server";
import PageHeader from "@/components/ui/PageHeader";
import Tabs from "@/components/ui/Tabs";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/Button";
import SubmitButton from "@/app/[locale]/dashboard/(protected)/preparation/SubmitButton";
import { createGalleryForBooking } from "@/app/[locale]/dashboard/(protected)/events/workspaceActions";

export default async function EventWorkspaceHeader({ title, galleryId, bookingId, active }: {
  title: string;
  galleryId?: string | null;
  bookingId?: string | null;
  active: "gallery" | "bookings" | "slots" | "equipment";
}) {
  const t = await getTranslations("eventWorkspace");
  const tabs = [
    ...(galleryId ? [{ id: "gallery", label: t("gallery"), href: "/dashboard/events/" + galleryId }] : []),
    ...(bookingId ? [
      { id: "bookings", label: t("bookings"), href: "/dashboard/bookings/" + bookingId },
      { id: "slots", label: t("slots"), href: "/dashboard/preparation/slots?event=" + bookingId },
      { id: "equipment", label: t("equipment"), href: "/dashboard/preparation/equipment?event=" + bookingId }
    ] : [])
  ];
  return <>
    <Link href="/dashboard/events" className="inline-flex min-h-11 self-start items-center text-sm font-semibold text-fg-subtle underline-offset-4 hover:text-accent hover:underline">{t("back")}</Link>
    <PageHeader title={title} description={t(active + "Description")}
      action={!bookingId && galleryId
        ? <Link href={"/dashboard/events/" + galleryId + "/setup"} className={buttonClasses({ variant: "primary" })}>{t("addBooking")}</Link>
        : !galleryId && bookingId ? <form action={createGalleryForBooking}>
          <input type="hidden" name="bookingId" value={bookingId} />
          <SubmitButton primary>{t("addGallery")}</SubmitButton>
        </form> : undefined}
    />
    <Tabs active={active} items={tabs} label={t("eventPages")} />
  </>;
}
