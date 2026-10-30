"use client";

import { useContext, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { logout3d } from "@/app/[locale]/3d/login/actions";
import { dismissPlatformNotification } from "@/app/[locale]/dashboard/(protected)/actions";
import { GameMenu, Rolling, pad, wrap, type MenuItem } from "../hud";
import { BookingPanel, SheetToggle, isInteractive, metaLabel, setSheetChoice, useScreenKeys, useSheetChoice, useStage } from "../booking/shared";
import styles from "../booking/Booking.module.css";
import { FieldContext, type FieldAlbum } from "../StageContext";
import { StudioHeading, formatBytes } from "./shared";
import type { StudioHome } from "./types";

/**
 * The 3D Dashboard's menu: the photographer's numbers, the platform's
 * notices, and every section of their backend. Until they put it away, a
 * new photographer also gets first steps to follow, each ticked off once done.
 * The album field behind it keeps to the photographer's own albums and stays
 * live: the album under the mouse pops up with the next few behind it, and a
 * click, or a tap on phones, where the sheet opens on a window onto the
 * field, opens it.
 */
export default function HomeScreen({ home }: { home: StudioHome }) {
  const t = useTranslations("album3d");
  const ta = useTranslations("admin");
  const { go, path } = useStage();
  const field = useContext(FieldContext);
  const [focus, setFocus] = useState(0);
  // On phones, the menu raised over the window onto the field, as the
  // photographer last left the Dashboard's sheet (see useSheetChoice).
  const raised = useSheetChoice() === "up";
  const [leaving, startLeaving] = useTransition();
  const { username } = home.account;

  const items: MenuItem[] = [
    {
      key: "events",
      label: t("studioEvents"),
      sub: t("studioEventsSub", { count: home.events, drafts: home.drafts }),
      text: ["album3d.studioEvents", "album3d.studioEventsSub"],
      run: () => go({ kind: "studio", username, page: "events" })
    },
    {
      key: "bookings",
      label: t("studioBookings"),
      sub: t("studioBookingsSub"),
      text: ["album3d.studioBookings", "album3d.studioBookingsSub"],
      run: () => go({ kind: "studio", username, page: "bookings" })
    },
    {
      key: "preparation",
      label: t("studioPreparation"),
      sub: t("studioPreparationSub"),
      text: ["album3d.studioPreparation", "album3d.studioPreparationSub"],
      run: () => go({ kind: "studio", username, page: "preparation" })
    },
    {
      key: "equipment",
      label: ta("equipment"),
      sub: t("studioEquipmentSub"),
      text: ["admin.equipment", "album3d.studioEquipmentSub"],
      run: () => go({ kind: "studio", username, page: "equipment" })
    },
    ...(["posters", "credits", "site", "storage", "account"] as const).map((page) => ({
      key: page,
      label: page === "posters" ? ta("sharingPosters") : page === "credits" ? ta("credits", { term: home.creditTerm }) : t(`studioCrumbs.${page}`),
      sub: page === "storage" ? t("studioStorage", { used: formatBytes(home.usedBytes), total: formatBytes(home.quotaBytes) }) : t(`studioSub.${page}`),
      text: [
        page === "posters" ? "admin.sharingPosters" : page === "credits" ? "admin.credits" : `album3d.studioCrumbs.${page}`,
        page === "storage" ? "album3d.studioStorage" : `album3d.studioSub.${page}`
      ],
      run: () => go({ kind: "studio", username, page })
    })),
    ...(home.listed
      ? [{ key: "archive", label: t("loginArchive"), sub: `@${username}`, text: ["album3d.loginArchive"], run: () => go({ kind: "photographer", username }) }]
      : []),
    { key: "signout", label: leaving ? t("loginSigningOut") : t("loginSignOut"), text: ["album3d.loginSignOut"], run: () => !leaving && startLeaving(() => logout3d()) }
  ];
  const at = Math.min(focus, items.length - 1);

  useScreenKeys((k, target) => {
    const move = (delta: number) => {
      const next = wrap(at + delta, items.length);
      setFocus(next);
      document.querySelector<HTMLElement>(`[data-menu-item="${next}"]`)?.scrollIntoView({ block: "nearest" });
    };
    if (k === "ArrowUp") move(-1);
    else if (k === "ArrowDown") move(1);
    else if (k === "Enter" && !isInteractive(target)) items[at]?.run();
    else return false;
    return true;
  });

  const share = home.quotaBytes > 0 ? Math.min(1, home.usedBytes / home.quotaBytes) : 0;

  return (
    <>
    <BookingPanel expanded="full" view={field?.live ? <FieldWindow /> : undefined} raised={raised}>
      {field?.live && (
        <SheetToggle up={raised} onToggle={() => setSheetChoice(raised ? "down" : "up")} downLabel={t("studioSheetCollapse")} />
      )}
      <StudioHeading trail={`@${username}`} title={t("studioTitle")} text={["album3d.studioTitle"]} />
      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
        {[
          [t("statAlbums"), home.events],
          [t("statPhotos"), home.photos]
        ].map(([label, value]) => (
          <div key={String(label)}>
            <dt className={metaLabel}>{label}</dt>
            <dd className="mt-1 text-[2.125rem] leading-none wide:text-[2.75rem]">
              <Rolling value={pad(Number(value))} />
              <span className="sr-only">{value}</span>
            </dd>
          </div>
        ))}
        <div className="min-w-40">
          <dt className={metaLabel}>{ta("myStorage")}</dt>
          <dd className="mt-2 text-sm">
            {t("studioStorage", { used: formatBytes(home.usedBytes), total: formatBytes(home.quotaBytes) })}
            <span aria-hidden="true" className="mt-2 block h-1 w-full bg-fg/10">
              <span className={`block h-full ${share > 0.9 ? "bg-danger" : "bg-accent"}`} style={{ width: `${share * 100}%` }} />
            </span>
          </dd>
        </div>
      </dl>

      {home.notices.length > 0 && (
        <ul aria-label={t("studioNotices")} className="mt-6 grid gap-2">
          {home.notices.map((notice) => (
            <li key={notice.id} className="border-l-2 border-accent bg-page/80 py-2 pl-3 pr-2 text-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{notice.title}</p>
                <form action={dismissPlatformNotification}>
                  <input type="hidden" name="notificationId" value={notice.id} />
                  <button type="submit" className="font-meta min-h-8 px-2 text-[0.625rem] uppercase tracking-[0.12em] text-fg-subtle hover:text-fg">
                    {t("studioDismiss")}
                  </button>
                </form>
              </div>
              {notice.body && <p className="mt-1 whitespace-pre-line text-xs leading-5 text-fg-muted">{notice.body}</p>}
            </li>
          ))}
        </ul>
      )}

      <FirstSteps home={home} path={path} />

      <GameMenu label={t("studioTitle")} items={items} focus={at} onFocus={setFocus} className="mt-6 wide:mt-8" />
    </BookingPanel>
    <FieldCaption />
    </>
  );
}

/** When and how many photos, above an album's name. */
function useAlbumMeta() {
  const t = useTranslations("album3d");
  return (album: FieldAlbum) => [album.date, t("photos", { count: album.photos })].filter(Boolean).join(" · ");
}

/** Beside the panel: the album under the mouse, or how to browse the field. */
function FieldCaption() {
  const t = useTranslations("album3d");
  const field = useContext(FieldContext);
  const meta = useAlbumMeta();
  const { touch } = useStage();
  if (!field?.live) return null;
  const album = field.hovered;
  return (
    <div aria-hidden="true" className={styles.fieldCaption}>
      {field.empty ? (
        <p className={metaLabel}>{t("studioFieldEmpty")}</p>
      ) : album ? (
        <>
          <p className={metaLabel}>{meta(album)}</p>
          <p className="mt-1 text-2xl font-extrabold uppercase leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]">{album.title}</p>
          <p className="font-meta mt-2 text-[0.625rem] uppercase tracking-[0.16em] text-accent-text">{t(touch ? "studioFieldTap" : "studioFieldClick")} →</p>
        </>
      ) : (
        <p className={metaLabel}>{t(touch ? "studioFieldHintTouch" : "studioFieldHint")}</p>
      )}
    </div>
  );
}

/**
 * On phones, the top of the sheet: how to browse, and the album the field
 * rests on, which a tap opens, with buttons beside it to step through the
 * photographer's albums without aiming a swipe in the window.
 */
function FieldWindow() {
  const t = useTranslations("album3d");
  const field = useContext(FieldContext);
  const meta = useAlbumMeta();
  const { touch } = useStage();
  const album = field ? (field.hovered ?? field.resting) : null;
  const step = "grid h-11 w-11 shrink-0 place-items-center text-lg transition hover:bg-accent-surface";
  return (
    <>
      <p className="font-meta text-[0.5625rem] uppercase tracking-[0.14em] text-fg-subtle">
        {t(field?.empty ? "studioFieldEmpty" : touch ? "studioFieldHintTouch" : "studioFieldHint")}
      </p>
      {field && album && (
        <div className="flex w-full min-w-0 items-stretch gap-2">
          <button
            type="button"
            onClick={() => field.open(album.index)}
            className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 border-l-2 border-accent bg-page/85 py-1.5 pl-3 pr-3 text-left"
          >
            <span className="min-w-0">
              <span className={`${metaLabel} block truncate`}>{meta(album)}</span>
              <span className="block truncate text-base font-extrabold uppercase leading-tight tracking-[-0.01em]">{album.title}</span>
            </span>
            <span aria-hidden="true" className="text-lg text-accent-text">→</span>
          </button>
          <span className="flex shrink-0 bg-page/85">
            <button type="button" onClick={() => field.step(-1)} aria-label={t("studioFieldPrevious")} className={step}>
              ↑
            </button>
            <button type="button" onClick={() => field.step(1)} aria-label={t("studioFieldNext")} className={step}>
              ↓
            </button>
          </span>
        </div>
      )}
    </>
  );
}

/** First steps for a new photographer, remembered as put away per account on this browser. */
function FirstSteps({ home, path }: { home: StudioHome; path: ReturnType<typeof useStage>["path"] }) {
  const t = useTranslations("album3d");
  const { username } = home.account;
  const storageKey = `studio-first-steps:${username}`;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    try {
      setShown(localStorage.getItem(storageKey) !== "done");
    } catch {
      setShown(true);
    }
  }, [storageKey]);
  const steps = [
    { key: "event", done: home.events > 0, href: path({ kind: "studio", username, page: "new" }) },
    { key: "photos", done: home.photos > 0, href: path({ kind: "studio", username, page: "events" }) },
    { key: "look", done: home.styled, href: path({ kind: "studio", username, page: "siteAppearance" }) },
    { key: "publish", done: home.listed, href: path({ kind: "studio", username, page: "events" }) }
  ] as const;
  if (!shown || steps.every((s) => s.done)) return null;
  const hide = () => {
    try {
      localStorage.setItem(storageKey, "done");
    } catch {
      // Hidden for this visit.
    }
    setShown(false);
  };
  return (
    <section aria-labelledby="studio-first-steps" className="mt-6 border border-border-strong bg-page/80 p-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="studio-first-steps" className={metaLabel}>
          {t("studioFirstSteps")}
        </h2>
        <button type="button" onClick={hide} className="font-meta min-h-8 px-2 text-[0.625rem] uppercase tracking-[0.12em] text-fg-subtle hover:text-fg">
          {t("studioDismiss")}
        </button>
      </div>
      <ol className="mt-2 grid gap-1">
        {steps.map((step, i) => (
          <li key={step.key}>
            <Link href={step.href} scroll={false} className="group flex min-h-10 items-center gap-3 text-sm">
              <span aria-hidden="true" className={`font-meta grid h-6 w-6 shrink-0 place-items-center text-[0.625rem] ${step.done ? "bg-accent text-page" : "border border-border-strong"}`}>
                {step.done ? "✓" : pad(i + 1)}
              </span>
              <span className={`min-w-0 flex-1 ${step.done ? "text-fg-subtle line-through" : "group-hover:text-accent-text"}`}>
                {t(`studioStep_${step.key}`)}
              </span>
              {step.done && <span className="sr-only">{t("studioStepDone")}</span>}
              <span aria-hidden="true" className="text-fg-subtle">→</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
