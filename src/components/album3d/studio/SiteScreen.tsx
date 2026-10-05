"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { pickText } from "@/lib/content";
import { GameMenu, Hints, type MenuItem } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, useStage } from "../booking/shared";
import type { StudioPage } from "@/lib/siteMode";
import { ClassicLink, StudioHeading } from "./shared";
import { useSiteBoard } from "./site";
import type { StudioSite } from "./types";

const GROUPS = ["siteAppearance", "siteHomepage", "siteContact", "siteFeatures", "account"] as const satisfies readonly StudioPage[];

/**
 * Site settings as a menu, one entry per group, with each group's card on
 * the board saying where it stands. Every group opens as its own panel.
 */
export default function SiteScreen({ site }: { site: StudioSite }) {
  const t = useTranslations("album3d");
  const ts = useTranslations("adminSite");
  const locale = useLocale();
  const { go, key, touch } = useStage();
  const { username } = site.account;
  const v = site.values;
  const onOff = (on: boolean) => t(on ? "studioOn" : "studioOff");
  const palette = [v.backgroundColor, v.surfaceColor, v.fieldColor, v.textColor, v.themeColor, v.darkBackgroundColor, v.darkSurfaceColor, v.darkFieldColor, v.darkTextColor, v.darkThemeColor];
  const features = [v.bookingEnabled, v.bookingPriceEnabled, v.lotteryEnabled, v.creditProfilesEnabled];

  const tiles = useMemo<BoardTile[]>(() => {
    const card = (i: number, main: string, detail: string[], left: number, total: number, status: string): BoardTile => ({
      id: GROUPS[i],
      column: 0,
      row: i,
      kicker: t(`studioCrumbs.${GROUPS[i]}`),
      main: main || "—",
      detail,
      left,
      total,
      status
    });
    return [
      card(0, pickText(locale, v.siteTitleEn, v.siteTitleZh), [ts(v.dashboardThemeMode === "MATCH_SITE" ? "dashboardAppearanceMatch" : "dashboardAppearancePlatform")], palette.filter(Boolean).length, palette.length, t("studioColours", { count: palette.filter(Boolean).length })),
      card(1, pickText(locale, v.homeTitleEn, v.homeTitleZh), [t("studioLinkCount", { count: site.links.length }), t("studioAnnouncementCount", { count: site.announcements.length })], site.links.length, Math.max(1, site.links.length), `${ts("announcementsSection")} · ${onOff(v.announcementsEnabled)}`),
      card(2, pickText(locale, v.contactTitleEn, v.contactTitleZh), [v.contactUrlEn, v.contactUrlZh].filter(Boolean), v.contactEnabled ? 1 : 0, 1, onOff(v.contactEnabled)),
      card(3, t("studioFeaturesOn", { count: features.filter(Boolean).length, total: features.length }), [v.timeZone], features.filter(Boolean).length, features.length, `${t("studioBookings")} · ${onOff(v.bookingEnabled)}`),
      card(4, site.displayName || `@${username}`, [`@${username}`, site.email].filter(Boolean), 1, 1, "")
    ];
    // Every value read here arrives with `site`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site, locale, t, ts]);
  const open = (index: number) => go({ kind: "studio", username, page: GROUPS[index] });
  const [at, setFocus] = useSiteBoard(`studio-site:${username}`, tiles, open);

  const items: MenuItem[] = GROUPS.map((page, i) => ({
    key: page,
    label: t(`studioCrumbs.${page}`),
    sub: t(`studioSub.${page}`),
    run: () => open(i)
  }));
  items.push({ key: "view", label: t("studioViewSite"), sub: site.homeUrl, external: true, run: () => window.open(site.homeUrl, "_blank", "noopener") });

  return (
    <>
      <BookingPanel>
        <StudioHeading trail={t("studioCrumbs.site")} title={ts("title")} />
        <p className="mt-4 text-sm text-fg-muted">{ts("intro")}</p>
        <GameMenu label={ts("title")} items={items} focus={at} onFocus={(i) => i < GROUPS.length && setFocus(i)} className="mt-6" />
        <ClassicLink href="/dashboard/settings" />
      </BookingPanel>
      {!touch && <Hints className={styles.menuHint} parts={[`${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]} />}
    </>
  );
}
