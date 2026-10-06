"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { GameMenu, Hints, Rolling, pad, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import type { BookingBoard } from "./types";
import {
  BookingPanel,
  LocalTimeNote,
  NotFoundPanel,
  isInteractive,
  metaLabel,
  useScene,
  useScreenKeys,
  useStage,
  useStageInput
} from "./shared";

/**
 * A photographer's booking board: their open events as cards on a board in
 * the scene, and as a menu in the panel. Opening one goes to its schedule.
 */
export default function BoardScreen({ board }: { board: BookingBoard | null }) {
  if (!board) return <NotFoundPanel />;
  return <Board board={board} />;
}

function Board({ board }: { board: BookingBoard }) {
  const t = useTranslations("album3d");
  const tb = useTranslations("booking");
  const { go, key, touch } = useStage();
  const scene = useScene("board");
  const [focus, setFocus] = useState(0);
  const events = board.events;

  const open = (index: number) => {
    const event = events[index];
    if (event) go({ kind: "book", username: board.username, token: event.token });
  };

  const tiles = useMemo<BoardTile[]>(
    () =>
      events.map((event, i) => ({
        id: event.token,
        column: 0,
        row: i,
        kicker: event.dates,
        main: event.title,
        detail: [event.location, event.description.split("\n")[0] ?? ""],
        left: event.remaining,
        total: Math.max(event.remaining, Math.min(16, event.slots)),
        status: event.remaining > 0 ? t("boardSeats", { count: event.remaining }) : tb("full")
      })),
    [events, t, tb]
  );

  useEffect(() => {
    scene?.setTiles("events", `board:${board.username}`, tiles, [], "");
  }, [scene, tiles, board.username]);
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

  const focused = events[focus];

  return (
    <>
      <BookingPanel>
        <p className={metaLabel}>
          @{board.username} <span aria-hidden="true" className="mx-2">／</span> {t("menuBooking")}
        </p>
        <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[4rem]">
          {t("boardTitle")}
        </h1>
        <div aria-hidden="true" className={styles.calloutRule} />
        {events.length === 0 ? (
          <p className="mt-8 max-w-md text-sm text-fg-muted">{tb("listEmpty")}</p>
        ) : (
          <>
            <p className={`${metaLabel} mt-6`}>
              {t("boardCount")}{" "}
              <span className="text-fg">
                <Rolling value={pad(focus + 1)} />
              </span>{" "}
              / {pad(events.length)}
            </p>
            <div className={`${styles.roster} mt-3`}>
              <GameMenu
                label={t("boardTitle")}
                focus={focus}
                onFocus={setFocus}
                items={events.map((event, i) => ({
                  key: event.token,
                  label: event.title,
                  sub: [event.dates, event.location, tiles[i]?.status].filter(Boolean).join(" · "),
                  run: () => open(i)
                }))}
              />
            </div>
            {focused?.description && <p className="mt-4 line-clamp-3 max-w-md whitespace-pre-line text-sm text-fg-muted">{focused.description}</p>}
          </>
        )}
        <LocalTimeNote />
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
