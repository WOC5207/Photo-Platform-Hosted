"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { exportCosplanPng, loadCosplanImages, renderCosplan } from "@/lib/cosplanCanvas";
import { GameMenu, Hints, wrap, type MenuItem } from "../../hud";
import styles from "../../ArchiveSite.module.css";
import { BookingPanel, isInteractive, metaLabel, useScene, useScreenKeys, useStage, useStageInput } from "../../booking/shared";
import { canShareFile, download, paintBlankPoster, printPoster, shareFile } from "../shared";
import { useCosplanStudio } from "./CosplanStudio";

/**
 * Create Cosplan, printing: the finished poster on the easel, and Download
 * slides it into the print slot while the full-size PNG renders.
 */
export default function CosplanPrint() {
  const t = useTranslations("album3d");
  const tc = useTranslations("cosplan");
  const ts = useTranslations("sharingPosters");
  const { key, touch, go } = useStage();
  const scene = useScene("poster");
  const { composition, images, status } = useCosplanStudio();
  const [focus, setFocus] = useState(0);
  const [state, setState] = useState<"idle" | "printing" | "error">("idle");
  // The last print, for the share sheet; any change to the poster retires it.
  const [printed, setPrinted] = useState<{ file: File; updatedAt: number } | null>(null);
  const [shareFailed, setShareFailed] = useState(false);
  useEffect(() => {
    if (printed && printed.updatedAt !== composition?.updatedAt) setPrinted(null);
  }, [printed, composition?.updatedAt]);

  useEffect(() => {
    if (!scene || status === "reading") return;
    if (!composition) {
      paintBlankPoster(scene.setPoster("cosplan:none", 0.8), t("creatorBlank"));
    } else {
      const canvas = scene.setPoster(`cosplan:${composition.templateId}`, composition.width / composition.height);
      const ctx = canvas.getContext("2d");
      if (ctx) renderCosplan(ctx, composition, images, canvas.width / composition.width);
    }
    scene.refresh();
  }, [scene, status, composition, images, t]);

  const print = async () => {
    if (!composition || state === "printing") return;
    setState("printing");
    try {
      // The board's images are loaded already; anything still on its way is loaded here.
      const ready = images.background && images.layers.size === composition.layers.filter((layer) => layer.type === "image").length ? images : await loadCosplanImages(composition);
      const blob = await printPoster(scene, () => exportCosplanPng(composition, ready));
      const filename = `cosplan-${Date.now()}.png`;
      download(blob, filename);
      setPrinted({ file: new File([blob], filename, { type: "image/png" }), updatedAt: composition.updatedAt });
      setShareFailed(false);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const items: MenuItem[] = composition
    ? [
        { key: "print", label: t(state === "printing" ? "creatorPrinting" : "creatorDownloadPng"), sub: t("creatorDownloadSub"), run: () => void print() },
        ...(printed && canShareFile(printed.file)
          ? [{ key: "share", label: ts("share"), sub: printed.file.name, run: () => void shareFile(printed.file, composition.templateTitle).then((ok) => setShareFailed(!ok)) }]
          : []),
        { key: "board", label: t("creatorBackToBoard"), sub: t("creatorBackToBoardSub"), run: () => go({ kind: "cosplan", step: "board" }) }
      ]
    : [{ key: "choose", label: tc("chooseBackground"), run: () => go({ kind: "cosplan" }) }];
  const at = Math.min(focus, items.length - 1);

  useScreenKeys((k, target) => {
    if (k === "ArrowUp") setFocus((f) => wrap(f - 1, items.length));
    else if (k === "ArrowDown") setFocus((f) => wrap(f + 1, items.length));
    else if (k === "Enter" && !isInteractive(target)) items[at]?.run();
    else return false;
    return true;
  });

  // A tap on the poster focuses printing; a second one prints.
  useStageInput((input) => {
    if (input.kind !== "pick" || input.index !== 0 || !composition) return;
    if (at === 0) void print();
    else setFocus(0);
  });

  const characters = composition?.layers.filter((layer) => layer.type === "image").length ?? 0;
  const texts = composition?.layers.filter((layer) => layer.type === "text").length ?? 0;

  return (
    <>
      <BookingPanel>
        <p className={metaLabel}>{t("menuCosplan")}</p>
        <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[4rem]">
          {composition ? composition.templateTitle : status === "reading" ? t("creatorReading") : t("creatorNoDraft")}
        </h1>
        <div aria-hidden="true" className={styles.calloutRule} />
        {composition && (
          <p className={`${metaLabel} mt-6`}>
            {composition.width} × {composition.height} PX <span aria-hidden="true" className="mx-2">／</span> {t("creatorCosplanCount", { characters, texts })}
          </p>
        )}
        {status === "ready" && (
          <>
            <p className="mt-3 max-w-md text-sm text-fg-muted">{t(composition ? "creatorPrintHint" : "creatorCosplanEmptyHint")}</p>
            <GameMenu label={t("menuCosplan")} className="mt-6" focus={at} onFocus={setFocus} items={items} />
          </>
        )}
        <p aria-live="polite" className="mt-4 min-h-5 text-sm">
          {state === "error" && <span className="text-danger">{t("creatorPrintFailed")}</span>}
          {shareFailed && <span className="text-danger">{ts("shareError")}</span>}
        </p>
      </BookingPanel>
      {!touch && status === "ready" && (
        <Hints className={styles.menuHint} parts={[`${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
