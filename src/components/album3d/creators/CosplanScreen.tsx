"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { readDraft, releaseDraft, restoreDraft } from "@/lib/cosplanDraft";
import { exportCosplanPng, loadCosplanImages, renderCosplan, type CosplanImages } from "@/lib/cosplanCanvas";
import type { CosplanComposition } from "@/lib/cosplanTypes";
import { GameMenu, Hints, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import { BookingPanel, isInteractive, metaLabel, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { download, paintBlankPoster, printPoster } from "./shared";

/**
 * Create Cosplan: the draft kept in this browser stands on the easel, and
 * prints to a full-size PNG. The classic editor (/cosplan) edits the same
 * draft.
 */
export default function CosplanScreen() {
  const t = useTranslations("album3d");
  const router = useRouter();
  const { key, touch } = useStage();
  const scene = useScene("poster");
  // Undefined while the browser's draft store is read.
  const [draft, setDraft] = useState<CosplanComposition | null | undefined>(undefined);
  const [images, setImages] = useState<CosplanImages | null>(null);
  const [focus, setFocus] = useState(0);
  const [state, setState] = useState<"idle" | "printing" | "error">("idle");

  useEffect(() => {
    let live = true;
    let restored: CosplanComposition | null = null;
    readDraft()
      .then((stored) => {
        if (!live) return;
        restored = stored ? restoreDraft(stored) : null;
        setDraft(restored);
        if (restored) void loadCosplanImages(restored).then((loaded) => live && setImages(loaded));
      })
      // Without IndexedDB (a private window) there is no draft to show.
      .catch(() => live && setDraft(null));
    return () => {
      live = false;
      if (restored) releaseDraft(restored);
    };
  }, []);

  useEffect(() => {
    if (!scene || draft === undefined) return;
    if (!draft) {
      paintBlankPoster(scene.setPoster("cosplan:none", 0.8), t("creatorBlank"));
    } else {
      const canvas = scene.setPoster(`cosplan:${draft.templateId}`, draft.width / draft.height);
      const ctx = canvas.getContext("2d");
      if (ctx) renderCosplan(ctx, draft, images ?? { background: null, foreground: null, layers: new Map() }, canvas.width / draft.width);
    }
    scene.refresh();
  }, [scene, draft, images, t]);

  const openClassic = () => router.push("/cosplan");
  const print = async () => {
    if (!draft || state === "printing") return;
    setState("printing");
    try {
      const blob = await printPoster(scene, async () => exportCosplanPng(draft, images ?? (await loadCosplanImages(draft))));
      download(blob, `cosplan-${Date.now()}.png`);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const items = draft
    ? [
        { key: "print", label: t(state === "printing" ? "creatorPrinting" : "creatorDownloadPng"), sub: t("creatorDownloadSub"), run: () => void print() },
        { key: "classic", label: t("creatorEditClassic"), sub: t("creatorEditClassicSub"), external: true, run: openClassic }
      ]
    : [{ key: "classic", label: t("creatorOpenClassic"), sub: t("creatorOpenClassicSub"), external: true, run: openClassic }];

  useScreenKeys((k, target) => {
    if (k === "ArrowUp") setFocus((f) => wrap(f - 1, items.length));
    else if (k === "ArrowDown") setFocus((f) => wrap(f + 1, items.length));
    else if (k === "Enter" && !isInteractive(target)) items[Math.min(focus, items.length - 1)]?.run();
    else return false;
    return true;
  });

  // A tap on the poster focuses printing; a second one prints.
  useStageInput((input) => {
    if (input.kind !== "pick" || !draft) return;
    if (focus === 0) void print();
    else setFocus(0);
  });

  const characters = draft?.layers.filter((layer) => layer.type === "image").length ?? 0;
  const texts = draft?.layers.filter((layer) => layer.type === "text").length ?? 0;

  return (
    <>
      <BookingPanel>
        <p className={metaLabel}>{t("menuCosplan")}</p>
        <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[4rem]">
          {draft ? draft.templateTitle : draft === null ? t("creatorNoDraft") : t("creatorReading")}
        </h1>
        <div aria-hidden="true" className={styles.calloutRule} />
        {draft && (
          <p className={`${metaLabel} mt-6`}>
            {draft.width} × {draft.height} PX <span aria-hidden="true" className="mx-2">／</span> {t("creatorCosplanCount", { characters, texts })}
          </p>
        )}
        {draft !== undefined && (
          <p className="mt-3 max-w-md text-sm text-fg-muted">{t(draft ? "creatorDraftHint" : "creatorCosplanEmptyHint")}</p>
        )}
        {draft !== undefined && (
          <GameMenu label={t("menuCosplan")} className="mt-6" focus={Math.min(focus, items.length - 1)} onFocus={setFocus} items={items} />
        )}
        <p aria-live="polite" className="mt-4 min-h-5 text-sm">
          {state === "error" && <span className="text-danger">{t("creatorPrintFailed")}</span>}
        </p>
      </BookingPanel>
      {!touch && draft !== undefined && (
        <Hints
          className={styles.menuHint}
          parts={[`${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]}
        />
      )}
    </>
  );
}
