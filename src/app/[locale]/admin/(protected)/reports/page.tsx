import { getLocale, getTranslations } from "next-intl/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { photoUrls } from "@/lib/images";
import { ownerName } from "@/lib/owner";
import ModerationReviewImage from "@/components/admin/ModerationReviewImage";
import { updateContentReport } from "./actions";

export const dynamic = "force-dynamic";

export default async function ContentReportsPage() {
  const locale = await getLocale();
  await requireAdmin(locale);
  const t = await getTranslations("adminReports");

  const reports = await prisma.contentReport.findMany({
    where: { status: { in: ["pending", "reviewing"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      id: true,
      reason: true,
      details: true,
      status: true,
      createdAt: true,
      photo: {
        select: {
          id: true,
          eventId: true,
          originalName: true,
          event: {
            select: {
              titleEn: true,
              titleZh: true,
              owner: {
                select: {
                  username: true,
                  displayName: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <header>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-[-0.03em]">{t("title")}</h1>
            <p className="mt-2 max-w-3xl text-sm text-fg-subtle">
              {t("description")}
            </p>
          </div>
          <span className="rounded-full bg-fg/10 px-3 py-1 text-sm font-semibold">
            {reports.length}
          </span>
        </div>
      </header>

      {reports.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-fg-subtle">
          {t("empty")}
        </p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {reports.map((report) => {
            const photo = report.photo;
            const album =
              (locale === "zh" ? photo.event.titleZh : photo.event.titleEn) ||
              photo.event.titleEn ||
              photo.event.titleZh;
            return (
              <li
                key={report.id}
                className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4"
              >
                <ModerationReviewImage
                  src={photoUrls(photo.eventId, photo.id).med}
                  alt={photo.originalName}
                />

                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{photo.originalName}</p>
                    <span className="rounded-full bg-fg/10 px-2 py-0.5 text-xs font-medium text-fg-muted">
                      {report.status === "reviewing"
                        ? t("statusReviewing")
                        : t("statusOpen")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-fg-subtle">
                    {ownerName(photo.event.owner)} · {album}
                  </p>
                  <p className="mt-1 text-xs text-fg-subtle">
                    {dateFormatter.format(report.createdAt)}
                  </p>
                </div>

                <dl className="rounded-lg border border-border bg-page p-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold text-fg-subtle">
                      {t("reason")}
                    </dt>
                    <dd className="mt-1 break-words text-fg">
                      {t.has(`reasons.${report.reason}`)
                        ? t(`reasons.${report.reason}`)
                        : report.reason}
                    </dd>
                  </div>
                  {report.details && (
                    <div className="mt-3 border-t border-border pt-3">
                      <dt className="text-xs font-semibold text-fg-subtle">
                        {t("details")}
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap break-words text-fg-muted">
                        {report.details}
                      </dd>
                    </div>
                  )}
                </dl>

                {report.status === "pending" && (
                  <form action={updateContentReport}>
                    <input type="hidden" name="id" value={report.id} />
                    <button
                      type="submit"
                      name="status"
                      value="reviewing"
                      className="min-h-10 w-full rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
                    >
                      {t("claim")}
                    </button>
                  </form>
                )}

                <form
                  action={updateContentReport}
                  className="flex flex-col gap-2"
                >
                  <input type="hidden" name="id" value={report.id} />
                  <label className="text-xs text-fg-subtle">
                    {t("resolutionNote")}
                    <textarea
                      name="note"
                      rows={3}
                      maxLength={2000}
                      required
                      className="mt-1 w-full rounded-lg border border-border-strong bg-page px-3 py-2 text-sm text-fg"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="submit"
                      name="status"
                      value="resolved"
                      className="min-h-10 rounded-lg bg-fg px-3 py-2 text-sm font-semibold text-page"
                    >
                      {t("resolve")}
                    </button>
                    <button
                      type="submit"
                      name="status"
                      value="dismissed"
                      className="min-h-10 rounded-lg border border-border-strong px-3 py-2 text-sm font-semibold text-fg-muted hover:text-fg"
                    >
                      {t("dismiss")}
                    </button>
                  </div>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
