"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { logout3d } from "@/app/[locale]/3d/login/actions";
import { dismissPlatformNotification } from "@/app/[locale]/dashboard/(protected)/actions";
import { GameMenu, Rolling, pad, wrap, type MenuItem } from "../hud";
import { BookingPanel, isInteractive, metaLabel, useScreenKeys, useStage } from "../booking/shared";
import { StudioHeading, formatBytes } from "./shared";
import type { StudioHome } from "./types";

/**
 * The 3D Dashboard's menu: the photographer's numbers, the platform's
 * notices, and every section of their backend. Sections without a 3D screen
 * yet open on the classic dashboard.
 */
export default function HomeScreen({ home }: { home: StudioHome }) {
  const t = useTranslations("album3d");
  const ta = useTranslations("admin");
  const tw = useTranslations("eventWorkspace");
  const router = useRouter();
  const { go } = useStage();
  const [focus, setFocus] = useState(0);
  const [leaving, startLeaving] = useTransition();
  const { username } = home.account;

  const classic = (key: string, label: string, href: string): MenuItem => ({
    key,
    label,
    sub: t("studioClassicSub"),
    external: true,
    run: () => router.push(href)
  });
  const items: MenuItem[] = [
    {
      key: "events",
      label: t("studioEvents"),
      sub: t("studioEventsSub", { count: home.events, drafts: home.drafts }),
      run: () => go({ kind: "studio", username, page: "events" })
    },
    classic("bookings", tw("allBookings"), "/dashboard/bookings"),
    classic("equipment", ta("equipment"), "/dashboard/equipment"),
    classic("posters", ta("sharingPosters"), "/dashboard/sharing-posters"),
    classic("credits", ta("credits", { term: home.creditTerm }), "/dashboard/credits"),
    classic("site", ta("site"), "/dashboard/settings"),
    classic("storage", ta("myStorage"), "/dashboard/storage"),
    classic("account", ta("account"), "/dashboard/account"),
    ...(home.account.admin ? [classic("admin", t("loginAdmin"), "/admin")] : []),
    ...(home.listed
      ? [{ key: "archive", label: t("loginArchive"), sub: `@${username}`, run: () => go({ kind: "photographer", username }) }]
      : []),
    { key: "signout", label: leaving ? t("loginSigningOut") : t("loginSignOut"), run: () => !leaving && startLeaving(() => logout3d()) }
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
    <BookingPanel>
      <StudioHeading trail={`@${username}`} title={t("studioTitle")} />
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

      <GameMenu label={t("studioTitle")} items={items} focus={at} onFocus={setFocus} className="mt-6 wide:mt-8" />
    </BookingPanel>
  );
}
