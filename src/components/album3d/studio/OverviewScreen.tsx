"use client";

import { useContext, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { GameMenu, Rolling, pad, wrap, type MenuItem } from "../hud";
import { BookingPanel, StepButtons, isInteractive, metaLabel, useScreenKeys, useStage } from "../booking/shared";
import { FieldContext } from "../StageContext";
import styles from "../ArchiveSite.module.css";
import { formatBytes } from "./shared";
import type { OwnerOverview } from "./types";

const DAY = 86_400_000;

/**
 * A photographer's own archive page, where "My archive" lands: their numbers,
 * the next event and the next booked session at a glance, with the way into
 * each in the Dashboard. Their albums stay on the stage as cards (see
 * ArchiveShelf), so ← → and a tap still open them.
 */
export default function OverviewScreen({ overview }: { overview: OwnerOverview }) {
  const t = useTranslations("album3d");
  const ta = useTranslations("admin");
  const router = useRouter();
  const { go, path, preview, setPreview } = useStage();
  const field = useContext(FieldContext);
  const [focus, setFocus] = useState(0);
  const { username, name } = overview.account;
  const { next, shoot } = overview;

  const studio = (page: "home" | "bookings" | "booking" | "event", id?: string) => () => go({ kind: "studio", username, page, ...(id && { id }) });
  const items: MenuItem[] = [
    ...(next && (next.bookingId || next.eventId)
      ? [
          {
            key: "next",
            label: t("overviewOpenNext"),
            sub: next.title,
            text: ["album3d.overviewOpenNext"],
            run: next.bookingId ? studio("booking", next.bookingId) : studio("event", next.eventId ?? "")
          }
        ]
      : []),
    {
      key: "bookings",
      label: t("studioBookings"),
      sub: t("overviewBookingsSub", { sessions: overview.sessions, fresh: overview.newBookings }),
      text: ["album3d.studioBookings", "album3d.overviewBookingsSub"],
      run: studio("bookings")
    },
    ...(next?.bookingId
      ? [
          {
            key: "packing",
            label: t("studioPreparation"),
            sub: t("overviewPackSub", { event: next.title }),
            text: ["album3d.studioPreparation", "album3d.overviewPackSub"],
            run: () => router.push(`${path({ kind: "studio", username, page: "preparation" })}?event=${encodeURIComponent(next.bookingId ?? "")}`, { scroll: false })
          }
        ]
      : []),
    {
      key: "albums",
      label: t("menuAlbums"),
      sub: t("menuAllAlbumsSub", { count: overview.albums }),
      text: ["album3d.menuAlbums", "album3d.menuAllAlbumsSub"],
      run: () => go({ kind: "albumSelect", username })
    },
    { key: "dashboard", label: t("loginDashboard"), sub: t("overviewDashboardSub"), text: ["album3d.loginDashboard", "album3d.overviewDashboardSub"], run: studio("home") }
  ];
  const at = Math.min(focus, items.length - 1);

  useScreenKeys((k, target) => {
    if (k === "ArrowUp") setFocus(wrap(at - 1, items.length));
    else if (k === "ArrowDown") setFocus(wrap(at + 1, items.length));
    else if (k === "Enter" && !isInteractive(target)) items[at]?.run();
    else return false;
    return true;
  });

  if (preview) return null;

  const days = next ? Math.round((Date.parse(`${next.day}T00:00:00Z`) - Date.parse(`${overview.today}T00:00:00Z`)) / DAY) : 0;
  const share = overview.quotaBytes > 0 ? Math.min(1, overview.usedBytes / overview.quotaBytes) : 0;

  return (
    <BookingPanel>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={metaLabel}>
          {t("loginArchive")} <span aria-hidden="true" className="mx-2">／</span> @{username}
        </p>
        {setPreview && (
          <button
            type="button"
            onClick={() => setPreview(true)}
            className="font-meta inline-flex min-h-8 items-center gap-1.5 border border-border-strong px-2.5 text-[0.625rem] uppercase tracking-[0.12em] text-fg-muted transition hover:border-fg hover:text-fg"
          >
            {t("overviewPreviewVisitor")} <span aria-hidden="true">↗</span>
          </button>
        )}
      </div>
      <h1 className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] [overflow-wrap:anywhere] wide:text-[3.25rem]">
        {name}
      </h1>
      <div aria-hidden="true" className={styles.calloutRule} />

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
        {[
          [t("statAlbums"), overview.albums],
          [t("statPhotos"), overview.photos],
          [t("statDrafts"), overview.drafts],
          [t("statSessions"), overview.sessions]
        ].map(([label, value]) => (
          <div key={String(label)} className="min-w-0">
            <dt className={`${metaLabel} truncate`}>{label}</dt>
            <dd className="mt-1 text-[1.75rem] leading-none wide:text-[2.25rem]">
              <Rolling value={pad(Number(value))} />
              <span className="sr-only">{value}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 flex items-center gap-3 text-xs text-fg-muted">
        <span className={metaLabel}>{ta("myStorage")}</span>
        <span aria-hidden="true" className="h-1 min-w-12 flex-1 bg-fg/10">
          <span className={`block h-full ${share > 0.9 ? "bg-danger" : "bg-accent"}`} style={{ width: `${share * 100}%` }} />
        </span>
        {t("studioStorage", { used: formatBytes(overview.usedBytes), total: formatBytes(overview.quotaBytes) })}
      </p>

      <section aria-labelledby="overview-next" className="mt-6 border border-border-strong bg-page/80 p-3">
        <h2 id="overview-next" className={metaLabel}>
          {t("overviewNext")}
          {next && (
            <span className="ml-2 text-accent-text">· {days < 0 ? t("overviewUnderway") : t("overviewWhen", { days })}</span>
          )}
        </h2>
        {next ? (
          <div className="mt-2 flex gap-3">
            {next.cover && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={next.cover} alt="" className="h-16 w-16 shrink-0 object-cover" />
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-bold uppercase">{next.title}</p>
              <p className="font-meta mt-1 truncate text-[0.6875rem] tracking-[0.08em] text-fg-subtle">
                {[next.dates, next.location].filter(Boolean).join(" · ")}
              </p>
              {(next.capacity > 0 || next.packing > 0) && (
                <p className="mt-1 text-xs text-fg-muted">
                  {[
                    next.capacity > 0 && t("overviewBooked", { booked: next.booked, capacity: next.capacity }),
                    next.packing > 0 && t("overviewPacking", { count: next.packing })
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-fg-muted">{t("overviewNone")}</p>
        )}
        {shoot && (
          <p className="mt-3 border-t border-border pt-2 text-xs text-fg-muted">
            <span className={metaLabel}>{t("overviewShoot")}</span>{" "}
            <Link href={path({ kind: "studio", username, page: "booking", id: shoot.bookingId })} scroll={false} className="hover:text-accent-text">
              {shoot.day} {shoot.time} · {shoot.name}
              {shoot.subject && ` (${shoot.subject})`} · {shoot.event}
            </Link>
          </p>
        )}
      </section>

      {field?.resting && (
        <div className="mt-6 flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => field.open(field.resting!.index)}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 border-l-2 border-accent bg-page/85 py-1.5 pl-3 pr-3 text-left transition hover:bg-accent-surface"
          >
            <span className="min-w-0">
              <span className={`${metaLabel} block truncate`}>
                {[field.resting.date || t("noDate"), t("photos", { count: field.resting.photos })].join(" · ")}
              </span>
              <span className="block truncate text-sm font-extrabold uppercase leading-tight">{field.resting.title}</span>
            </span>
            <span aria-hidden="true" className="text-lg text-accent-text">→</span>
          </button>
          <span className="flex shrink-0 bg-page/85">
            <StepButtons onStep={field.step} atStart={overview.albums < 2} atEnd={overview.albums < 2} />
          </span>
        </div>
      )}

      <GameMenu label={name} items={items} focus={at} onFocus={setFocus} className="mt-6" />
    </BookingPanel>
  );
}
