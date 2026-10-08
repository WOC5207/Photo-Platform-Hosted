"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import AnnouncementsManager from "@/components/admin/AnnouncementsManager";
import PersonalLinksManager from "@/components/admin/PersonalLinksManager";
import { pickText } from "@/lib/content";
import { HOME_STREAM_LAYOUTS, resolveHomeStreamLayout } from "@/lib/homePhotoStreamTypes";
import type { BoardTile } from "../board";
import { BookingPanel } from "../booking/shared";
import { StudioHeading } from "./shared";
import { Check, Group, Pair, SaveBar, checkClass, useSiteBoard, useSiteSave } from "./site";
import type { StudioSite } from "./types";

/**
 * The homepage's titles, its personal links and its announcements. The
 * links and announcements are the board's cards, links first.
 */
export default function HomepageScreen({ site }: { site: StudioSite }) {
  const t = useTranslations("album3d");
  const ts = useTranslations("adminSite");
  const locale = useLocale();
  const { state, pending, submit } = useSiteSave();
  const v = site.values;

  const tiles = useMemo<BoardTile[]>(
    () => [
      {
        id: "home",
        column: 0,
        row: 0,
        kicker: ts("groupHomepageTitle"),
        main: pickText(locale, v.homeTitleEn, v.homeTitleZh) || "—",
        detail: [pickText(locale, v.homeSubtitleEn, v.homeSubtitleZh)].filter(Boolean),
        left: 1,
        total: 1,
        status: ""
      },
      ...site.links.map((l, i) => ({
        id: l.id,
        column: 0,
        row: 1 + i,
        kicker: ts("personalLinksSection"),
        main: pickText(locale, l.labelEn, l.labelZh) || l.url,
        detail: [l.url],
        left: 1,
        total: 1,
        status: ""
      })),
      ...site.announcements.map((a, i) => ({
        id: a.id,
        column: 0,
        row: 1 + site.links.length + i,
        kicker: ts("announcementsSection"),
        main: pickText(locale, a.titleEn, a.titleZh) || "—",
        detail: [pickText(locale, a.bodyEn, a.bodyZh).slice(0, 80)],
        left: v.announcementsEnabled ? 1 : 0,
        total: 1,
        status: t(v.announcementsEnabled ? "studioOn" : "studioOff")
      }))
    ],
    [site, v, locale, t, ts]
  );
  useSiteBoard(`studio-homepage:${site.account.username}`, tiles);

  return (
    <BookingPanel expanded="full">
      <StudioHeading trail={t("studioCrumbs.site")} title={ts("settingsTabHomepage")} />
      <form onSubmit={submit} aria-busy={pending} className="mt-6 grid gap-6">
        <Group title={ts("groupHomepageTitle")} hint={ts("groupHomepageHint")}>
          <Pair en="homeTitleEn" zh="homeTitleZh" values={v} labels={[ts("homeTitleEn"), ts("homeTitleZh")]} max={200} />
          <Pair en="homeSubtitleEn" zh="homeSubtitleZh" values={v} labels={[ts("homeSubtitleEn"), ts("homeSubtitleZh")]} max={300} />
          <Check name="announcementsEnabled" defaultChecked={v.announcementsEnabled}>
            {ts("announcementsEnabledLabel")}
          </Check>
        </Group>
        <Group title={ts("homeStreamLayoutTitle")} hint={ts("homeStreamLayoutHint")}>
          {HOME_STREAM_LAYOUTS.map((l) => (
            <label key={l} className="flex items-start gap-3 border border-border-strong p-3 text-sm has-[:checked]:border-fg">
              <input type="radio" name="homeStreamLayout" value={l} defaultChecked={resolveHomeStreamLayout(v.homeStreamLayout) === l} className={`mt-0.5 ${checkClass}`} />
              <span className="grid gap-1">
                <span className="font-semibold">{ts(l === "GRID" ? "homeStreamLayoutGrid" : "homeStreamLayoutCollage")}</span>
                <span className="text-xs leading-5 text-fg-subtle">{ts(l === "GRID" ? "homeStreamLayoutGridHint" : "homeStreamLayoutCollageHint")}</span>
              </span>
            </label>
          ))}
        </Group>
        <SaveBar section="homepage" state={state} pending={pending} />
      </form>
      <div className="mt-8 grid gap-8 border-t border-border-strong pt-5">
        <PersonalLinksManager links={site.links} />
        <AnnouncementsManager announcements={site.announcements} />
      </div>
    </BookingPanel>
  );
}
