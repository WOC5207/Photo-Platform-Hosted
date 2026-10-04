"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { GameMenu, Hints, wrap, type MenuItem } from "../../hud";
import styles from "../../ArchiveSite.module.css";
import { BookingPanel, fieldClass, isInteractive, metaLabel, useScene, useScreenKeys, useStage, useStageInput } from "../../booking/shared";
import { download, paintBlankPoster, printPoster, safeFilename } from "../shared";
import { useMatPaint } from "./mat";
import { SaveState } from "./SharepostPhotos";
import { useSharepostStudio } from "./SharepostStudio";

const EDGES = [2160, 4096, 8192] as const;

/**
 * Create Sharepost, printing: format and size are set on the menu (←/→ or
 * Enter), Print slides the poster into the slot while the full-size file
 * renders from the original photographs, and Share hands the printed file
 * to the device's share sheet where it has one.
 */
export default function SharepostPrint() {
  const t = useTranslations("album3d");
  const ts = useTranslations("sharingPosters");
  const router = useRouter();
  const { key, touch, go } = useStage();
  const scene = useScene("poster");
  const studio = useSharepostStudio();
  const { composition, photos, tools, status, update, name } = studio;
  const [focus, setFocus] = useState(0);
  const [state, setState] = useState<"idle" | "printing" | "error">("idle");
  const [printed, setPrinted] = useState<{ file: File; signature: string } | null>(null);
  const [notice, setNotice] = useState("");
  useMatPaint(scene, studio, { blank: (canvas) => paintBlankPoster(canvas, t("creatorAddPhotosBlank")) });

  const signature = composition ? JSON.stringify({ name, composition }) : "";
  // A change after printing needs a new print before it can be shared.
  useEffect(() => {
    if (printed && printed.signature !== signature) setPrinted(null);
  }, [printed, signature]);

  const format = composition?.export.format === "png" ? "png" : "jpeg";
  const edge = composition?.export.longestEdge ?? 2160;
  const size = composition && tools ? tools.sharingPosterPixelSize(composition) : null;
  const unresolved = photos.filter((photo) => !photo.source).length;
  const blocked = !composition || photos.length === 0 ? ts("selectPhotoFirst") : unresolved ? ts("unresolvedError", { count: unresolved }) : studio.metrics?.footerTooTall ? ts("footerTooTall") : "";
  const canShare = (file: File) => {
    if (typeof navigator === "undefined" || !navigator.share) return false;
    try {
      return !navigator.canShare || navigator.canShare({ files: [file] });
    } catch {
      return false;
    }
  };

  const print = async () => {
    if (!composition || !tools || blocked || state === "printing") return;
    setState("printing");
    setNotice("");
    try {
      const blob = await printPoster(scene, () => tools.exportSharingPoster(composition, photos));
      const filename = `${safeFilename(name, "sharing-poster")}.${format === "png" ? "png" : "jpg"}`;
      download(blob, filename);
      setPrinted({ file: new File([blob], filename, { type: blob.type }), signature });
      setState("idle");
    } catch {
      setState("error");
    }
  };
  const share = async () => {
    if (!printed || !canShare(printed.file)) return;
    try {
      await navigator.share({ files: [printed.file], title: name });
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") setNotice(ts("shareError"));
    }
  };
  const setFormat = () => update((value) => ({ ...value, export: { ...value.export, format: value.export.format === "png" ? "jpeg" : "png" } }));
  const setEdge = (delta: number) =>
    update((value) => ({ ...value, export: { ...value.export, longestEdge: EDGES[wrap(Math.max(0, EDGES.indexOf(value.export.longestEdge as (typeof EDGES)[number])) + delta, EDGES.length)] } }));

  const items: (MenuItem & { adjust?: (delta: number) => void })[] = composition
    ? [
        { key: "print", label: t(state === "printing" ? "creatorPrinting" : "creatorDownloadFormat", { format: format.toUpperCase() }), sub: size ? `${size.width} × ${size.height} PX` : "", run: () => void print() },
        ...(printed && canShare(printed.file) ? [{ key: "share", label: ts("share"), sub: printed.file.name, run: () => void share() }] : []),
        { key: "format", label: ts("format"), value: format === "png" ? "PNG" : "JPEG · 92%", run: setFormat, adjust: () => setFormat() },
        { key: "edge", label: ts("longestEdge"), value: `${edge} PX`, run: () => setEdge(1), adjust: setEdge },
        { key: "photos", label: t("creatorBackToPhotos"), sub: t("creatorSharepostCount", { photos: photos.length }), run: () => go({ kind: "sharepost" }) },
        { key: "classic", label: t("creatorEditClassic"), sub: t("creatorEditClassicSub"), external: true, run: () => router.push("/sharing-poster") }
      ]
    : [];
  const at = Math.min(focus, Math.max(0, items.length - 1));

  useScreenKeys((k, target) => {
    if (!items.length) return false;
    if (k === "ArrowUp") setFocus((f) => wrap(f - 1, items.length));
    else if (k === "ArrowDown") setFocus((f) => wrap(f + 1, items.length));
    else if ((k === "ArrowLeft" || k === "ArrowRight") && items[at]?.adjust) items[at].adjust?.(k === "ArrowLeft" ? -1 : 1);
    else if (k === "Enter" && !isInteractive(target)) items[at]?.run();
    else return false;
    return true;
  });
  // A tap on the poster focuses printing; a second one prints.
  useStageInput((input) => {
    if (input.kind !== "pick" || input.index !== 0) return;
    if (at === 0) void print();
    else setFocus(0);
  });

  return (
    <>
      <BookingPanel>
        <p className={metaLabel}>{t("menuPoster")}</p>
        <h1 className="mt-3 text-[2.25rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[3.25rem]">{status === "ready" ? ts("exportTitle") : t("creatorReading")}</h1>
        <div aria-hidden="true" className={styles.calloutRule} />
        {composition && (
          <>
            <label className="mt-6 grid gap-1 text-sm font-semibold text-fg-muted">
              {ts("projectName")}
              <input value={name} required maxLength={120} aria-invalid={!name.trim()} onChange={(event) => studio.setName(event.target.value)} className={fieldClass} />
            </label>
            {edge > 4096 && <p className="mt-3 text-sm text-fg-subtle">{ts("largeExportHint")}</p>}
            {blocked && <p role="alert" className="mt-3 text-sm text-warning">{blocked}</p>}
            <GameMenu label={ts("exportTitle")} className="mt-4" focus={at} onFocus={setFocus} items={items} />
            <p aria-live="polite" className="mt-3 min-h-5 text-sm">
              {state === "error" && <span className="text-danger">{t("creatorPrintFailed")}</span>}
              {notice && <span className="text-danger">{notice}</span>}
              {printed && state === "idle" && !notice && <span className="text-fg-muted">{ts("exportReady")}</span>}
            </p>
            <SaveState />
          </>
        )}
      </BookingPanel>
      {!touch && (
        <Hints className={styles.menuHint} parts={[`${key("move")} ${t("hintSelect")}`, `${key("sides")} ${t("creatorHintChange")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`]} />
      )}
    </>
  );
}
