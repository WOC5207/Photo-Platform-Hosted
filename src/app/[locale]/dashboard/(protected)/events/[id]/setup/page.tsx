import { notFound, redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import NewEventWorkflow from "@/components/events/NewEventWorkflow";

export default async function SetupEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const locale = await getLocale();
  const user = await requireUser(locale);
  const gallery = await prisma.event.findFirst({
    where: { id, ownerId: user.id }, include: { bookingEvent: { where: { ownerId: user.id }, select: { id: true } } }
  });
  if (!gallery) notFound();
  if (gallery.bookingEvent) redirect("/" + locale + "/dashboard/bookings/" + gallery.bookingEvent.id);
  return <NewEventWorkflow gallery={gallery} />;
}
