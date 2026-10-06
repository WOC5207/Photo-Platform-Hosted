"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GameMenu, Hints, Rolling, pad, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, isInteractive, metaLabel, primaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { StudioHeading } from "./shared";
import type { StudioBookings } from "./types";

/**
 * The photographer's booking pages: cards on the board, lit for the seats
 * still free (a closed page's card is dimmed), and a menu in the panel.
 * Opening one goes to its schedule. Booking pages are made with their event,
 * so "New event" starts both.
 */
export default function BookingsScreen({ bookings }: { bookings: StudioBookings }) {
  const t = useTranslations("album3d");
  const tb = useTranslations("adminBookings");
  const tw = useTranslations("eventWorkspace");
  const ts = useTranslations("adminSite");
  const { go, path, key, touch } = useStage();
  const scene = useScene("board");
  const [focus, setFocus] = useState(0);
  const { username } = bookings.account;
  const events = bookings.events;

  const open = (index: number) => {
    const event = events[index];
    if (event) go({ kind: "studio", username, page: "booking", id: event.id });
  };

  const tiles = useMemo<BoardTile[]>(
    () =>
      events.map((event, i) => ({
        id: event.id,
        column: 0,
        row: i,
        kicker: event.dates || tw("noDate"),
        main: event.title,
        detail: [event.location, tb("booked", { booked: event.booked, capacity: event.capacity })],
        // Lamps for the seats still free; a closed page is dimmed with its lamps off.
        left: event.open ? event.capacity - event.booked : 0,
        total: Math.min(16, event.capacity),
        status: !bookings.bookingEnabled ? tb("offPublicly") : event.open ? tb("open") : tb("closed")
      })),
    [events, bookings.bookingEnabled, tb, tw]
  );

  useEffect(() => {
    scene?.setTiles("events", `studio-bookings:${username}`, tiles, [], "");
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
        <StudioHeading trail={t("studioBookings")} title={t("studioBookings")} />
        {!bookings.bookingEnabled && <p role="status" className="mt-5 text-sm text-fg-muted">{ts("groupBookingHint")}</p>}
        <Link href={path({ kind: "studio", username, page: "new" })} scroll={false} className={`${primaryClass} mt-6 w-full`}>
          {tw("newEvent")}
          <span aria-hidden="true" className="text-lg">+</span>
        </Link>
        {events.length === 0 ? (
          <p className="mt-6 max-w-md text-sm text-fg-muted">{tb("emptyDescription")}</p>
        ) : (
          <>
            <p className={`${metaLabel} mt-6`}>
              {t("studioBookingCount")}{" "}
              <span className="text-fg">
                <Rolling value={pad(focus + 1)} />
              </span>{" "}
              / {pad(events.length)}
            </p>
            <GameMenu
              label={t("studioBookings")}
              className="mt-3"
              focus={focus}
              onFocus={setFocus}
              items={events.map((event, i) => ({
                key: event.id,
                label: event.title,
                sub: [event.dates || tw("noDate"), tb("booked", { booked: event.booked, capacity: event.capacity }), tiles[i]?.status].join(" · "),
                run: () => open(i)
              }))}
            />
          </>
        )}
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
