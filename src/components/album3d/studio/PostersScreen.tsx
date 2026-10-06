"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { GameMenu, Hints, pad, wrap, type MenuItem } from "../hud";
import styles from "../ArchiveSite.module.css";
import { BookingPanel, isInteractive, metaLabel, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { RAIL_PICK } from "../types";
import { paintBlankPoster } from "../creators/shared";
import { FormNote, StudioHeading } from "./shared";
import type { StudioPosterSummary, StudioPosters } from "./types";

/** The focused poster on the easel: its first photograph over its name, as a stand-in until it opens. */
function paintCover(canvas: HTMLCanvasElement, poster: StudioPosterSummary, image: HTMLImageElement | null) {
  const c = canvas.getContext("2d");
  if (!c) return;
  const { width: w, height: h } = canvas;
  const unit = Math.min(w, h) / 100;
  const margin = unit * 6;
  const foot = unit * 18;
  c.fillStyle = "#f4f0ea";
  c.fillRect(0, 0, w, h);
  const box = { x: margin, y: margin, w: w - margin * 2, h: h - margin * 2 - foot };
  if (image) {
    const scale = Math.max(box.w / image.naturalWidth, box.h / image.naturalHeight);
    const sw = box.w / scale;
    const sh = box.h / scale;
    c.drawImage(image, (image.naturalWidth - sw) / 2, (image.naturalHeight - sh) / 2, sw, sh, box.x, box.y, box.w, box.h);
  } else {
    c.fillStyle = "rgba(28,26,22,0.08)";
    c.fillRect(box.x, box.y, box.w, box.h);
  }
  c.fillStyle = "rgba(28,26,22,0.86)";
  c.textAlign = "left";
  c.textBaseline = "middle";
  c.font = `700 ${Math.round(unit * 5.2)}px ui-sans-serif, system-ui, sans-serif`;
  c.fillText(poster.name, margin, h - margin - foot / 2 - unit * 2.6, box.w);
  c.fillStyle = "rgba(28,26,22,0.5)";
  c.font = `600 ${Math.round(unit * 3)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  c.fillText(`${poster.ratio} · ${poster.updated}`.toUpperCase(), margin, h - margin - foot / 2 + unit * 3.6, box.w);
}

/**
 * The photographer's saved Sharepost posters, each standing on the rail in
 * front of the easel with the focused one on it. Opening one edits it in the
 * 3D Sharepost editor; new, duplicate and delete go through the classic
 * dashboard's poster API.
 */
export default function PostersScreen({ posters: list }: { posters: StudioPosters }) {
  const t = useTranslations("album3d");
  const ts = useTranslations("sharingPosters");
  const locale = useLocale();
  const router = useRouter();
  const { go, key, touch } = useStage();
  const scene = useScene("poster");
  const { confirm, dialog } = useConfirm();
  const { username } = list.account;
  const posters = list.posters;
  const [focus, setFocus] = useState(0);
  const [menuFocus, setMenuFocus] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const at = Math.min(focus, Math.max(0, posters.length - 1));
  const poster = posters[at] ?? null;

  // Covers load once each; a finished one repaints the rail and the easel.
  const images = useRef(new Map<string, HTMLImageElement | "loading">());
  const [loaded, setLoaded] = useState(0);
  const image = (src: string) => {
    if (!src) return null;
    const found = images.current.get(src);
    if (found instanceof HTMLImageElement) return found;
    if (!found) {
      images.current.set(src, "loading");
      const next = new Image();
      next.decoding = "async";
      next.onload = () => {
        images.current.set(src, next);
        setLoaded((v) => v + 1);
      };
      next.src = src;
    }
    return null;
  };

  useEffect(() => {
    if (!scene) return;
    scene.setRail(
      posters.length ? posters.map((p, i) => ({ key: p.id, image: image(p.thumb), label: `${pad(i + 1)} / ${pad(posters.length)}`, sub: p.name })) : null,
      at
    );
    // `loaded`: covers that arrived since.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, posters, at, loaded]);
  useEffect(() => () => scene?.setRail(null, 0), [scene]);
  useEffect(() => {
    if (!scene) return;
    const frame = requestAnimationFrame(() => {
      if (poster) paintCover(scene.setPoster(`studio-poster:${poster.id}`, poster.aspect, 1024), poster, image(poster.cover));
      else paintBlankPoster(scene.setPoster("studio-poster:none", 0.8, 1024), ts("newPoster"));
      scene.refresh();
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, poster, loaded, ts]);

  const open = (id: string) => go({ kind: "studio", username, page: "poster", id });
  const act = async (request: () => Promise<Response>, then: (response: Response) => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const response = await request();
      if (!response.ok) throw new Error("failed");
      await then(response);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };
  const json = { "Content-Type": "application/json" };
  const create = () =>
    act(
      () => fetch("/api/dashboard/sharing-posters", { method: "POST", headers: json, body: JSON.stringify({ locale }) }),
      async (response) => open(((await response.json()) as { id: string }).id)
    );
  const duplicate = (p: StudioPosterSummary) =>
    act(
      () => fetch(`/api/dashboard/sharing-posters/${encodeURIComponent(p.id)}/duplicate`, { method: "POST", headers: json, body: JSON.stringify({ name: `${p.name} — ${ts("copySuffix")}` }) }),
      async (response) => open(((await response.json()) as { id: string }).id)
    );
  const remove = async (p: StudioPosterSummary) => {
    if (!(await confirm({ message: ts("deleteConfirm", { name: p.name }), confirmLabel: ts("delete") }))) return;
    await act(
      () => fetch(`/api/dashboard/sharing-posters/${encodeURIComponent(p.id)}`, { method: "DELETE" }),
      async () => router.refresh()
    );
  };

  const items: MenuItem[] = [
    ...(poster
      ? [
          { key: "open", label: ts("open"), sub: poster.name, run: () => open(poster.id) },
          { key: "duplicate", label: ts("duplicate"), sub: poster.name, run: () => void duplicate(poster) },
          { key: "delete", label: ts("delete"), sub: poster.name, run: () => void remove(poster) }
        ]
      : []),
    { key: "new", label: busy ? ts("creating") : ts("newPoster"), sub: ts("description"), run: () => void create() }
  ];
  const menuAt = Math.min(menuFocus, items.length - 1);

  const move = (delta: number) => posters.length && setFocus(wrap(at + delta, posters.length));
  useScreenKeys((k, target) => {
    if (k === "ArrowLeft" || k === "ArrowRight") move(k === "ArrowLeft" ? -1 : 1);
    else if (k === "ArrowUp") setMenuFocus(wrap(menuAt - 1, items.length));
    else if (k === "ArrowDown") setMenuFocus(wrap(menuAt + 1, items.length));
    else if (k === "Enter" && !isInteractive(target)) items[menuAt]?.run();
    else return false;
    return true;
  });
  useStageInput((input) => {
    if (input.kind === "swipe" && input.x) move(input.x);
    else if (input.kind === "wheel") move(input.direction);
    else if (input.kind === "pick" && input.index >= RAIL_PICK) setFocus(input.index - RAIL_PICK);
    else if (input.kind === "pick" && input.index === 0 && poster) open(poster.id);
  });

  return (
    <>
      <BookingPanel>
        <StudioHeading trail={t("studioCrumbs.posters")} title={ts("title")} />
        {poster ? (
          <div className="mt-6 grid gap-1">
            <p className={metaLabel}>
              {t("studioCrumbs.poster")} {pad(at + 1)} / {pad(posters.length)}
            </p>
            <p className="text-lg font-semibold [overflow-wrap:anywhere]">{poster.name}</p>
            <p className="text-sm text-fg-muted">
              {ts("projectMeta", { count: poster.photos, updated: poster.updated })} · {poster.ratio}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-2">
            <p className="text-lg font-semibold">{ts("emptyTitle")}</p>
            <p className="text-sm text-fg-muted">{ts("emptyDescription")}</p>
          </div>
        )}
        <GameMenu label={ts("title")} className="mt-4" focus={menuAt} onFocus={setMenuFocus} items={items} />
        {failed && (
          <div className="mt-3">
            <FormNote tone="error">{ts("projectActionError")}</FormNote>
          </div>
        )}
        {list.more && <p className="mt-3 text-xs text-fg-subtle">{t("studioPostersMore")}</p>}
      </BookingPanel>
      {dialog}
      {!touch && (
        <Hints
          className={styles.menuHint}
          parts={[...(posters.length > 1 ? [`${key("sides")} ${t("studioHintPoster")}`] : []), `${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]}
        />
      )}
    </>
  );
}
