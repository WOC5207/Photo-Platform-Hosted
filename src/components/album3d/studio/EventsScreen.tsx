"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { GameMenu, Hints, Rolling, pad, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { ReelEntry } from "../reel";
import { BookingPanel, isInteractive, metaLabel, primaryClass, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { StudioHeading } from "./shared";
import type { StudioAccount, StudioEventSummary } from "./types";

const FILTERS = ["all", "upcoming", "past", "drafts"] as const;
type Filter = (typeof FILTERS)[number];
const FILTER_LABEL = {
  all: "studioReelAll",
  upcoming: "studioReelUpcoming",
  past: "studioReelPast",
  drafts: "studioReelDrafts"
} as const satisfies Record<Filter, string>;

/** Today in the photographer's own time zone, as event days are written. */
function localToday() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The first event from today on, else the latest one: where the reel opens. */
function nearest(list: StudioEventSummary[], today: string) {
  const next = list.findIndex((e) => e.day && e.day >= today);
  if (next >= 0) return next;
  const dated = list.map((e) => Boolean(e.day)).lastIndexOf(true);
  return dated >= 0 ? dated : 0;
}

/**
 * The photographer's events as a reel of instant prints in the scene, oldest
 * on the left with a "today" line on the ruler, and the focused event's
 * file in the panel: its dates, place and photos, and what to do with it
 * (open it, manage its photos or add more). The filters narrow the reel to
 * what's coming, what's past or the drafts.
 */
export default function EventsScreen({ account, events }: { account: StudioAccount; events: StudioEventSummary[] }) {
  const t = useTranslations("album3d");
  const tw = useTranslations("eventWorkspace");
  const { go, key, path, touch } = useStage();
  const scene = useScene("reel");
  const { username } = account;
  // Read after hydration, so the server and the browser agree on the first render.
  const [today, setToday] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [focus, setFocus] = useState(0);
  const [action, setAction] = useState(0);

  // Oldest first along the track; events without dates wait at the far end.
  const reel = useMemo(() => {
    const dated = events.filter((e) => e.day).sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
    return [...dated, ...events.filter((e) => !e.day)];
  }, [events]);
  const matches = useMemo(
    () =>
      ({
        all: () => true,
        upcoming: (e: StudioEventSummary) => Boolean(e.day) && e.day >= today,
        past: (e: StudioEventSummary) => Boolean(e.day) && e.day < today,
        drafts: (e: StudioEventSummary) => !e.published
      }) satisfies Record<Filter, (e: StudioEventSummary) => boolean>,
    [today]
  );
  const shown = useMemo(() => reel.filter(matches[filter]), [reel, matches, filter]);
  const at = Math.min(focus, Math.max(0, shown.length - 1));
  const event = shown[at];

  useEffect(() => {
    const now = localToday();
    setToday(now);
    setFocus(nearest(reel, now));
    // Only on arrival: later changes keep the photographer's place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (next: Filter) => {
    if (next === filter) return;
    const list = reel.filter(matches[next]);
    // The same event stays in focus when the new list has it.
    const kept = event ? list.findIndex((e) => e.id === event.id) : -1;
    setFilter(next);
    setFocus(kept >= 0 ? kept : nearest(list, today));
  };

  const entries = useMemo<ReelEntry[]>(
    () =>
      shown.map((e) => ({
        id: e.id,
        kicker: e.dateLabel || tw("noDate"),
        title: e.title,
        detail: [e.location, tw("photoCount", { count: e.photoCount })].filter(Boolean).join(" · "),
        status: e.published ? tw("published") : tw("draft"),
        published: e.published,
        thumb: e.cover,
        large: e.coverLarge,
        day: e.day
      })),
    [shown, tw]
  );
  useEffect(() => {
    scene?.setEntries(`studio:${username}:${filter}`, entries, today, t("studioReelToday"));
  }, [scene, entries, username, filter, today, t]);
  useEffect(() => {
    scene?.setFocus(at);
  }, [scene, at]);

  /** Into the event: the print is drawn up off the track on the way. */
  const enter = (index: number, page: "event" | "photos" | "upload") => {
    const target = shown[index];
    if (!target) return;
    const next = () => go({ kind: "studio", username, page, id: target.id });
    if (scene) scene.launch(index, next);
    else next();
  };
  const actions = event
    ? [
        { key: "open", label: t("studioReelOpen"), sub: t("studioReelOpenSub"), run: () => enter(at, "event") },
        { key: "photos", label: t("studioPhotos"), sub: tw("photoCount", { count: event.photoCount }), run: () => enter(at, "photos") },
        { key: "upload", label: t("studioUpload"), sub: t("studioReelUploadSub"), run: () => enter(at, "upload") }
      ]
    : [];
  const actionAt = Math.min(action, Math.max(0, actions.length - 1));

  const move = (delta: number) => {
    if (shown.length > 0) setFocus(Math.max(0, Math.min(shown.length - 1, at + delta)));
  };

  useScreenKeys((k, target) => {
    if (k === "ArrowLeft" || k === "ArrowRight") move(k === "ArrowLeft" ? -1 : 1);
    else if ((k === "ArrowUp" || k === "ArrowDown") && actions.length) setAction(wrap(actionAt + (k === "ArrowUp" ? -1 : 1), actions.length));
    else if (k === "Enter" && !isInteractive(target)) actions[actionAt]?.run();
    else return false;
    return true;
  });

  useStageInput((input) => {
    if (input.kind === "pick") {
      if (input.index === at) enter(input.index, "event");
      else setFocus(input.index);
    } else if (input.kind === "wheel") move(input.direction);
    else move(input.x !== 0 ? input.x : input.y);
  });

  const count = (f: Filter) => reel.filter(matches[f]).length;

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
            <div role="group" aria-label={t("studioReelFilter")} className="mt-6 flex flex-wrap gap-x-1 gap-y-2 border-b border-border">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={f === filter}
                  onClick={() => choose(f)}
                  className={`-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-2 text-xs uppercase tracking-[0.08em] transition ${
                    f === filter ? "border-accent font-semibold text-fg" : "border-transparent text-fg-muted hover:text-fg"
                  }`}
                >
                  {t(FILTER_LABEL[f])}
                  <span className="font-meta text-[0.625rem] text-fg-subtle">{pad(count(f))}</span>
                </button>
              ))}
            </div>
            {!event ? (
              <p className="mt-6 text-sm text-fg-muted">{t("studioReelNone")}</p>
            ) : (
              <section aria-label={event.title} aria-live="polite" className="mt-6">
                <p className={metaLabel}>
                  {t("studioEventCount")}{" "}
                  <span className="text-fg">
                    <Rolling value={pad(at + 1)} />
                  </span>{" "}
                  / {pad(shown.length)}
                </p>
                <h2 className="mt-2 text-2xl font-extrabold uppercase leading-tight tracking-[-0.02em] [overflow-wrap:anywhere] wide:text-[2rem]">
                  {event.title}
                </h2>
                <p className="font-meta mt-2 text-xs uppercase tracking-[0.1em] text-fg-muted">
                  {[event.dateLabel || tw("noDate"), event.location].filter(Boolean).join(" · ")}
                </p>
                <p className="mt-1 text-xs">
                  <span className={event.published ? "font-semibold text-accent-text" : "text-fg-subtle"}>
                    {event.published ? tw("published") : tw("draft")}
                  </span>
                </p>
                <GameMenu label={event.title} items={actions} focus={actionAt} onFocus={setAction} className="mt-5" />
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => move(-1)} disabled={at === 0} className={secondaryClass}>
                    <span aria-hidden="true">←</span>
                    {t("studioReelEarlier")}
                  </button>
                  <button type="button" onClick={() => move(1)} disabled={at >= shown.length - 1} className={`${secondaryClass} ml-auto`}>
                    {t("studioReelLater")}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </BookingPanel>
      {!touch && event && (
        <Hints
          className={styles.menuHint}
          parts={[
            `${key("sides")} ${t("studioHintEvent")}`,
            `${key("move")} ${t("studioHintAction")}`,
            `${key("confirm")} ${t("hintOpen")}`,
            `${key("back")} ${t("hintBack")}`
          ]}
        />
      )}
    </>
  );
}
