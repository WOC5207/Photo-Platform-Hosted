"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Hints, Rolling, pad, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, isInteractive, metaLabel, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { ClassicLink, StudioHeading, formatBytes } from "./shared";
import type { StudioStorage } from "./types";

/** Lamps on an event's card: its share of the photos' bytes, in tenths. */
const LAMPS = 10;

/**
 * Disk use: the quota bar and its split in the panel, and each event as a
 * card on the board, largest first, its lamps lit for its share of the
 * photos. Enter opens the focused event's photos on the light table.
 */
export default function StorageScreen({ storage }: { storage: StudioStorage }) {
  const t = useTranslations("album3d");
  const ts = useTranslations("adminStorage");
  const { go, path, key, touch } = useStage();
  const scene = useScene("board");
  const [focus, setFocus] = useState(0);
  const { username } = storage.account;
  const events = storage.events;
  const at = Math.min(focus, Math.max(0, events.length - 1));
  const event = events[at];
  const share = (bytes: number) => (storage.photosBytes > 0 ? bytes / storage.photosBytes : 0);

  const tiles = useMemo<BoardTile[]>(
    () =>
      events.map((e, i) => ({
        id: e.id,
        column: 0,
        row: i,
        kicker: formatBytes(e.bytes),
        main: e.title,
        detail: [ts("photoCount", { count: e.photos }) + (e.pending ? ` · ${ts("pendingPhotoCount", { count: e.pending })}` : "")],
        left: Math.round(share(e.bytes) * LAMPS),
        total: LAMPS,
        status: ts("shareOfPhotos", { pct: (share(e.bytes) * 100).toFixed(1) })
      })),
    // share reads storage.photosBytes, which comes with events.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, ts]
  );
  useEffect(() => {
    scene?.setTiles("events", `studio-storage:${username}`, tiles, [], "");
  }, [scene, tiles, username]);
  useEffect(() => {
    scene?.setFocus(at);
  }, [scene, at]);

  const open = (index: number) => {
    const e = events[index];
    if (e) go({ kind: "studio", username, page: "photos", id: e.id });
  };
  const move = (delta: number) => events.length && setFocus(wrap(at + delta, events.length));
  useScreenKeys((k, target) => {
    if (k === "ArrowUp" || k === "ArrowLeft") move(-1);
    else if (k === "ArrowDown" || k === "ArrowRight") move(1);
    else if (k === "Enter" && !isInteractive(target)) open(at);
    else return false;
    return true;
  });
  useStageInput((input) => {
    const across = scene?.columns() ?? 1;
    if (input.kind === "pick") {
      if (input.index === at) open(at);
      else setFocus(input.index);
    } else if (input.kind === "wheel") move(input.direction);
    else move(input.y !== 0 ? input.y * across : input.x);
  });

  const used = storage.quotaBytes > 0 ? Math.min(1, storage.usedBytes / storage.quotaBytes) : 0;
  const remaining = Math.max(0, storage.quotaBytes - storage.usedBytes);
  const full = remaining === 0;
  const nearlyFull = !full && used >= 0.9;

  return (
    <>
      <BookingPanel>
        <StudioHeading trail={t("studioCrumbs.storage")} title={ts("myStorageTitle")} />
        <p className="mt-4 text-sm text-fg-muted">{ts("myStorageIntro")}</p>

        <section aria-labelledby="studio-quota" className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="studio-quota" className={metaLabel}>
              {ts("quotaTitle")}
            </h2>
            <span className="text-sm">{ts("quotaUsed", { used: formatBytes(storage.usedBytes), total: formatBytes(storage.quotaBytes) })}</span>
          </div>
          <span aria-hidden="true" className="mt-2 block h-1.5 w-full bg-fg/10">
            <span className={`block h-full ${full || nearlyFull ? "bg-danger" : "bg-accent"}`} style={{ width: `${used * 100}%` }} />
          </span>
          <p className={`mt-2 text-xs ${full || nearlyFull ? "text-danger" : "text-fg-subtle"}`}>
            {full ? ts("quotaFull") : nearlyFull ? ts("quotaNearlyFull") : ts("quotaRemaining", { remaining: formatBytes(remaining) })}
          </p>
        </section>

        <dl className="mt-6 grid grid-cols-3 gap-3">
          {[
            [ts("totalLabel"), storage.usedBytes],
            [ts("photosLabel"), storage.photosBytes],
            [ts("siteImagesLabel"), storage.siteImagesBytes]
          ].map(([label, bytes]) => (
            <div key={String(label)}>
              <dt className={metaLabel}>{label}</dt>
              <dd className="mt-1 text-lg leading-none">{formatBytes(Number(bytes))}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="studio-storage-events" className="mt-8 grid gap-3">
          <div>
            <h2 id="studio-storage-events" className={metaLabel}>
              {ts("eventsTitle")}
            </h2>
            <p className="mt-1 text-xs text-fg-subtle">{ts("eventsHint")}</p>
          </div>
          {event ? (
            <div className="grid gap-3 border border-border-strong bg-page/70 p-3">
              <p className={metaLabel}>
                {t("studioEvent")}{" "}
                <span className="text-fg">
                  <Rolling value={pad(at + 1)} />
                </span>{" "}
                / {pad(events.length)}
              </p>
              <p className="font-semibold">{event.title}</p>
              <p className="text-sm text-fg-muted">
                {formatBytes(event.bytes)} · {ts("photoCount", { count: event.photos })}
                {event.pending > 0 && ` · ${ts("pendingPhotoCount", { count: event.pending })}`} · {ts("shareOfPhotos", { pct: (share(event.bytes) * 100).toFixed(1) })}
              </p>
              <Link href={path({ kind: "studio", username, page: "photos", id: event.id })} scroll={false} className={secondaryClass}>
                {t("studioPhotos")}
                <span aria-hidden="true" className="ml-auto">→</span>
              </Link>
            </div>
          ) : (
            <p className="text-sm text-fg-subtle">{ts("noEvents")}</p>
          )}
        </section>
        <ClassicLink href="/dashboard/storage" />
      </BookingPanel>
      {!touch && events.length > 0 && (
        <Hints className={styles.menuHint} parts={[`${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
