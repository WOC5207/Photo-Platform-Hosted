"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import SiteImageUploader from "@/components/admin/SiteImageUploader";
import type { BoardTile } from "../board";
import { BookingPanel, fieldClass, metaLabel } from "../booking/shared";
import { StudioHeading } from "./shared";
import { Check, Group, SaveBar, labelClass, useSiteBoard, useSiteSave } from "./site";
import type { StudioSite } from "./types";

const LANGUAGES = [
  ["En", "English"],
  ["Zh", "中文"]
] as const;

/**
 * The visitor contact block: whether it shows, and its title, link and QR
 * code in each language. Each language is a card on the board.
 */
export default function SiteContactScreen({ site }: { site: StudioSite }) {
  const t = useTranslations("album3d");
  const ts = useTranslations("adminSite");
  const { state, pending, submit } = useSiteSave();
  const v = site.values as unknown as Record<string, string> & { contactEnabled: boolean };

  const tiles = useMemo<BoardTile[]>(
    () =>
      LANGUAGES.map(([suffix, language], i) => ({
        id: suffix,
        column: 0,
        row: i,
        kicker: language,
        main: v[`contactTitle${suffix}`] || "—",
        detail: [v[`contactUrl${suffix}`], site.images[`contactQr${suffix}`] ? ts(`contactQr${suffix}Section`) : ""].filter(Boolean),
        left: v.contactEnabled ? 1 : 0,
        total: 1,
        status: t(v.contactEnabled ? "studioOn" : "studioOff")
      })),
    [v, site.images, t, ts]
  );
  useSiteBoard(`studio-contact:${site.account.username}`, tiles);

  return (
    <BookingPanel expanded="full">
      <StudioHeading trail={t("studioCrumbs.site")} title={t("studioCrumbs.siteContact")} />
      <p className="mt-4 text-sm text-fg-muted">{ts("contactHint")}</p>
      <form onSubmit={submit} aria-busy={pending} className="mt-6 grid gap-6">
        <Check name="contactEnabled" defaultChecked={v.contactEnabled}>
          {ts("contactEnabledLabel")}
        </Check>
        {LANGUAGES.map(([suffix, language]) => (
          <Group key={suffix} title={language}>
            <label className={labelClass}>
              {ts(`contactTitle${suffix}`)}
              <input name={`contactTitle${suffix}`} defaultValue={v[`contactTitle${suffix}`]} maxLength={120} className={fieldClass} />
            </label>
            <label className={labelClass}>
              {ts(`contactUrl${suffix}`)}
              <input name={`contactUrl${suffix}`} type="url" defaultValue={v[`contactUrl${suffix}`]} maxLength={500} placeholder="https://…" className={fieldClass} />
            </label>
          </Group>
        ))}
        <SaveBar section="contact" state={state} pending={pending} />
      </form>
      <div className="mt-8 grid gap-6">
        <p className={metaLabel}>{ts("imageChangesSaveAutomatically")}</p>
        <SiteImageUploader kind="contactQrEn" currentUrl={site.images.contactQrEn} />
        <SiteImageUploader kind="contactQrZh" currentUrl={site.images.contactQrZh} />
      </div>
    </BookingPanel>
  );
}
