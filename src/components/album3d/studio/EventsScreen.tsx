"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GameMenu, Hints, Rolling, pad, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, isInteractive, metaLabel, primaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { ClassicLink, StudioHeading } from "./shared";
import type { StudioAccount, StudioEventSummary } from "./types";

/**
 * The photographer's events, drafts included: cards on the board in the
 * scene (a draft's card is dimmed) and a menu in the panel. Opening one goes
 * to its details; "New event" starts one.
 */
export default function EventsScreen({ account, events }: { account: StudioAccount; events: StudioEventSummary[] }) {
  const t = useTranslations("album3d");
  const tw = useTranslations("eventWorkspace");
  const { go, path, key, touch } = useStage();
  const scene = useScene("board");
  const [focus, setFocus] = useState(0);
  const { username } = account;

  const open = (index: number) => {
    const event = events[index];
    if (event) go({ kind: "studio", username, page: "event", id: event.id });
  };

  const tiles = useMemo<BoardTile[]>(
    () =>
      events.map((event, i) => ({
        id: event.id,
        column: 0,
        row: i,
        kicker: event.dateLabel || tw("noDate"),
        main: event.title,
        detail: [event.location, tw("photoCount", { count: event.photoCount })],
        // Drafts are drawn dimmed, as full events are on the booking board; no seat lamps.
        left: event.published ? 1 : 0,
        total: 0,
        status: event.published ? tw("published") : tw("draft"),
        // The album's cover, as its page on the site shows it.
        image: event.cover || undefined
      })),
    [events, tw]
  );

  useEffect(() => {
    scene?.setTiles("events", `studio:${username}`, tiles, [], "");
  }, [scene, tiles, username]);
  useEffect(() => {
    scene?.setFocus(focus);
  }, [scene, focus]);

  const move = (delta: number) => {
    if (events.length > 0) setFocus((current) => wrap(current + delta, events.length));
  };

  useScreenKeys((k, target) => {
    if (k === "ArrowUp" || k === "ArrowLeft") move(-1);
    else if (k === "ArrowDown" || k === "ArrowRight") move(1);
    else if (k === "Enter" && !isInteractive(target)) open(focus);
    else return false;
    return true;
  });

  useStageInput((input) => {
    const across = scene?.columns() ?? 1;
    if (input.kind === "pick") {
      if (input.index === focus) open(input.index);
      else setFocus(input.index);
    } else if (input.kind === "wheel") move(input.direction);
    else move(input.y !== 0 ? input.y * across : input.x);
  });

  return (
    <>
      <BookingPanel>
        <StudioHeading trail={t("studioEvents")} title={t("studioEvents")} />
        <Link href={path({ kind: "studio", username, page: "new" })} scroll={false} className={`${primaryClass} mt-6 w-full`}>
          {tw("newEvent")}
          <span aria-hidden="true" className="text-lg">+</span>
        </Link>
        {events.length === 0 ? (
          <p className="mt-6 max-w-md text-sm text-fg-muted">{t("studioNoEvents")}</p>
        ) : (
          <>
            <p className={`${metaLabel} mt-6`}>
              {t("studioEventCount")}{" "}
              <span className="text-fg">
                <Rolling value={pad(focus + 1)} />
              </span>{" "}
              / {pad(events.length)}
            </p>
            <GameMenu
              label={t("studioEvents")}
              className="mt-3"
              focus={focus}
              onFocus={setFocus}
              items={events.map((event, i) => ({
                key: event.id,
                label: event.title,
                sub: [event.dateLabel || tw("noDate"), tw("photoCount", { count: event.photoCount }), tiles[i]?.status].join(" · "),
                run: () => open(i)
              }))}
            />
          </>
        )}
        <ClassicLink href="/dashboard/events" />
      </BookingPanel>
      {!touch && events.length > 0 && (
        <Hints
          className={styles.menuHint}
          parts={[`${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]}
        />
      )}
    </>
  );
}
