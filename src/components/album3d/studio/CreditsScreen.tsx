"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { addCreditProfile, deleteCreditProfile, updateCreditProfile, type CreditProfileState } from "@/app/[locale]/dashboard/(protected)/credits/actions";
import ConfirmSubmit from "@/components/admin/ConfirmSubmit";
import { Link } from "@/i18n/navigation";
import { Hints, Rolling, pad, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import type { BoardTile } from "../board";
import { BookingPanel, fieldClass, isInteractive, metaLabel, secondaryClass, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { ClassicLink, FormNote, StudioHeading } from "./shared";
import type { StudioCreditProfile, StudioCredits } from "./types";

/** Lamps on a profile's card: one per remembered link. */
const LAMPS = 8;

type Row = { key: number; platform: string; url: string };
let rowSeq = 0;
const row = (link?: { platform: string; url: string }): Row => ({ key: rowSeq++, platform: link?.platform ?? "", url: link?.url ?? "" });

/** The focused profile: its name and links, saved together as the classic page does. */
function ProfileForm({ profile, term }: { profile: StudioCreditProfile; term: string }) {
  const t = useTranslations("album3d");
  const tc = useTranslations("common");
  const tcr = useTranslations("adminCredits");
  const te = useTranslations("adminEvents");
  const [links, setLinks] = useState(() => profile.links.map((l) => row(l)));
  const edit = (key: number, change: Partial<Row>) => setLinks(links.map((l) => (l.key === key ? { ...l, ...change } : l)));

  return (
    <div className="grid gap-3 border border-border-strong bg-page/70 p-3">
      <form action={updateCreditProfile} className="grid gap-3">
        <input type="hidden" name="id" value={profile.id} />
        <input type="hidden" name="socialLinksJson" value={JSON.stringify(links.map(({ platform, url }) => ({ platform, url })))} />
        <label className="grid gap-1 text-sm font-semibold text-fg-muted">
          {tcr("creditNamePlaceholder", { term })}
          <input name="creditName" required defaultValue={profile.name} maxLength={200} className={fieldClass} />
        </label>
        <ul className="grid gap-2">
          {links.map((link) => (
            <li key={link.key} className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)_auto] items-end gap-2">
              <label className="grid gap-1 text-xs text-fg-subtle">
                {te("socialPlatformPlaceholder")}
                <input value={link.platform} onChange={(e) => edit(link.key, { platform: e.target.value })} maxLength={60} className={fieldClass} />
              </label>
              <label className="grid min-w-0 gap-1 text-xs text-fg-subtle">
                {te("socialUrlPlaceholder")}
                <input value={link.url} onChange={(e) => edit(link.key, { url: e.target.value })} maxLength={500} className={fieldClass} />
              </label>
              <button type="button" aria-label={te("removeSocialLinkAria")} onClick={() => setLinks(links.filter((l) => l.key !== link.key))} className={secondaryClass}>
                ×
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setLinks([...links, row()])} className={secondaryClass}>
            + {te("addSocialLink")}
          </button>
          <button type="submit" className={`${secondaryClass} ml-auto`}>
            {tc("save")}
          </button>
        </div>
      </form>
      <form action={deleteCreditProfile}>
        <input type="hidden" name="id" value={profile.id} />
        <ConfirmSubmit label={tc("delete")} confirmText={tcr("confirmDelete")} />
      </form>
      <span className="sr-only" aria-live="polite">
        {t("studioCreditLinks", { count: profile.links.length })}
      </span>
    </div>
  );
}

/**
 * Remembered credits as cards on the board, a lamp lit per social link. The
 * panel adds new ones and edits the focused one's name and links.
 */
export default function CreditsScreen({ credits }: { credits: StudioCredits }) {
  const t = useTranslations("album3d");
  const tcr = useTranslations("adminCredits");
  const { key, path, touch } = useStage();
  const scene = useScene("board");
  const [focus, setFocus] = useState(0);
  const [state, add, adding] = useActionState<CreditProfileState, FormData>(addCreditProfile, {});
  const { username } = credits.account;
  const profiles = credits.enabled ? credits.profiles : [];
  const at = Math.min(focus, Math.max(0, profiles.length - 1));
  const profile = profiles[at];
  const term = credits.term;

  const tiles = useMemo<BoardTile[]>(
    () =>
      profiles.map((p, i) => ({
        id: p.id,
        column: 0,
        row: i,
        kicker: term,
        main: p.name,
        detail: p.links.map((l) => l.platform).filter(Boolean).slice(0, 3),
        left: Math.min(LAMPS, p.links.length),
        total: LAMPS,
        status: t("studioCreditLinks", { count: p.links.length })
      })),
    [profiles, term, t]
  );
  useEffect(() => {
    scene?.setTiles("events", `studio-credits:${username}`, tiles, [], "");
  }, [scene, tiles, username]);
  useEffect(() => {
    scene?.setFocus(at);
  }, [scene, at]);

  const move = (delta: number) => profiles.length && setFocus(wrap(at + delta, profiles.length));
  useScreenKeys((k, target) => {
    if (k === "ArrowUp" || k === "ArrowLeft") move(-1);
    else if (k === "ArrowDown" || k === "ArrowRight") move(1);
    else if (k === "Enter" && !isInteractive(target)) document.querySelector<HTMLInputElement>("#studio-credit input[name=creditName]")?.focus();
    else return false;
    return true;
  });
  useStageInput((input) => {
    const across = scene?.columns() ?? 1;
    if (input.kind === "pick") setFocus(input.index);
    else if (input.kind === "wheel") move(input.direction);
    else move(input.y !== 0 ? input.y * across : input.x);
  });

  return (
    <>
      <BookingPanel>
        <StudioHeading trail={t("studioCrumbs.credits")} title={tcr("title", { term })} />
        <p className="mt-4 text-sm text-fg-muted">{tcr("intro")}</p>
        {!credits.enabled ? (
          <div className="mt-6 grid gap-3">
            <p className="text-sm text-fg-muted">{t("studioCreditsOff")}</p>
            <Link href={path({ kind: "studio", username, page: "siteFeatures" })} scroll={false} className={secondaryClass}>
              {t("studioCreditsTurnOn")}
              <span aria-hidden="true" className="ml-auto">→</span>
            </Link>
          </div>
        ) : (
          <>
            <form action={add} className="mt-6 flex items-end gap-2">
              <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-fg-muted">
                {tcr("creditNamePlaceholder", { term })}
                <input name="creditName" required maxLength={200} className={fieldClass} />
              </label>
              <button type="submit" disabled={adding} className={secondaryClass}>
                + {tcr("addCreditProfile", { term })}
              </button>
            </form>
            {state.error && (
              <div className="mt-2">
                <FormNote tone="error">{tcr(state.error === "duplicate" ? "duplicateError" : "validationError")}</FormNote>
              </div>
            )}
            <section id="studio-credit" aria-label={profile?.name} className="mt-6 grid gap-3">
              {profile ? (
                <>
                  <p className={metaLabel}>
                    {term}{" "}
                    <span className="text-fg">
                      <Rolling value={pad(at + 1)} />
                    </span>{" "}
                    / {pad(profiles.length)}
                  </p>
                  <ProfileForm key={`${profile.id}:${profile.name}:${profile.links.length}`} profile={profile} term={term} />
                </>
              ) : (
                <p className="text-sm text-fg-subtle">{tcr("noCreditProfiles", { term })}</p>
              )}
            </section>
          </>
        )}
        <ClassicLink href={credits.enabled ? "/dashboard/credits" : "/dashboard/settings?section=features"} />
      </BookingPanel>
      {!touch && profiles.length > 0 && (
        <Hints className={styles.menuHint} parts={[`${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintChange")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
