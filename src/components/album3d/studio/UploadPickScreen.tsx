"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GameMenu, Hints, pad, wrap, type MenuItem } from "../hud";
import styles from "../ArchiveSite.module.css";
import { BookingPanel, isInteractive, primaryClass, useScreenKeys, useStage } from "../booking/shared";
import { StudioHeading } from "./shared";
import type { StudioAccount, StudioEventSummary } from "./types";

/**
 * "Upload photos" from the Dashboard's menu: first the event the photos go
 * to, newest first as the classic list orders them, or a new one, which
 * opens on its upload once made. Either way the classic photo wizard follows.
 * The focus starts on the latest event that has begun, since photos come
 * after the shoot, rather than on one still to come.
 */
export default function UploadPickScreen({ account, events }: { account: StudioAccount; events: StudioEventSummary[] }) {
  const t = useTranslations("album3d");
  const tw = useTranslations("eventWorkspace");
  const { go, key, path, touch } = useStage();
  const [focus, setFocus] = useState(0);
  const { username } = account;

  const items: MenuItem[] = events.map((event) => ({
    key: event.id,
    label: event.title,
    sub: [event.dateLabel || tw("noDate"), tw("photoCount", { count: event.photoCount }), event.published ? "" : tw("draft")]
      .filter(Boolean)
      .join(" · "),
    run: () => go({ kind: "studio", username, page: "upload", id: event.id })
  }));
  const at = Math.min(focus, Math.max(0, items.length - 1));

  useEffect(() => {
    // Today in the photographer's own time zone, read after hydration.
    const now = new Date();
    const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const begun = events.findIndex((e) => e.day && e.day <= today);
    if (begun > 0) setFocus(begun);
    // Only on arrival: later changes keep the photographer's place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useScreenKeys((k, target) => {
    if (!items.length) return false;
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

  return (
    <>
    <BookingPanel expanded="full">
      <StudioHeading trail={t("studioUploadPhotos")} title={t("studioUploadPickTitle")} />
      <p className="mt-6 text-sm text-fg-muted">{t(events.length ? "studioUploadPickHint" : "studioUploadPickEmpty")}</p>
      <Link
        href={`${path({ kind: "studio", username, page: "new" })}?then=upload`}
        scroll={false}
        className={`${primaryClass} mt-4 w-full`}
      >
        {tw("newEvent")}
        <span aria-hidden="true" className="text-lg">+</span>
      </Link>
      {items.length > 0 && <GameMenu label={t("studioUploadPickTitle")} items={items} focus={at} onFocus={setFocus} className="mt-6" />}
    </BookingPanel>
    {!touch && items.length > 0 && (
      <Hints
        className={styles.menuHint}
        parts={[`${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintConfirm")}`, `${key("back")} ${t("hintBack")}`]}
      />
    )}
    </>
  );
}
