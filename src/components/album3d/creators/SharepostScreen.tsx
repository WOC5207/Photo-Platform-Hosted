"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import type { SharingPosterComposition, SharingPosterResolvedPhoto } from "@/lib/sharingPoster";
import { GameMenu, Hints, wrap } from "../hud";
import styles from "../ArchiveSite.module.css";
import { BookingPanel, isInteractive, metaLabel, useScene, useScreenKeys, useStage, useStageInput } from "../booking/shared";
import { download, paintBlankPoster, printPoster, safeFilename } from "./shared";

interface Draft {
  name: string;
  composition: SharingPosterComposition;
  photos: SharingPosterResolvedPhoto[];
}

interface Images {
  photos: Map<string, HTMLImageElement>;
  layers: Map<string, HTMLImageElement>;
}

// The poster code (layout, glass, schema) loads with the screen's data, not with the page.
const loadTools = () =>
  Promise.all([import("@/lib/sharingPoster"), import("@/lib/sharingPosterCanvas"), import("@/components/sharing-posters/localSharingPoster")]).then(
    ([poster, canvas, local]) => ({ ...poster, ...canvas, ...local })
  );
type Tools = Awaited<ReturnType<typeof loadTools>>;

/**
 * Create Sharepost: the draft kept in this browser stands on the easel, and
 * prints from the original files as the classic editor (/sharing-poster)
 * does. That editor edits the same draft.
 */
export default function SharepostScreen() {
  const t = useTranslations("album3d");
  const locale = useLocale();
  const router = useRouter();
  const { key, touch } = useStage();
  const scene = useScene("poster");
  // Undefined while the browser's draft store is read.
  const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
  const [tools, setTools] = useState<Tools | null>(null);
  const [images, setImages] = useState<Images | null>(null);
  const [focus, setFocus] = useState(0);
  const [state, setState] = useState<"idle" | "printing" | "error">("idle");

  useEffect(() => {
    let live = true;
    loadTools()
      .then(async (loaded) => {
        const stored = await loaded.readLocalPosterDraft(loaded.defaultSharingPosterComposition(locale, ""));
        if (!live) return;
        const next = stored && stored.composition.photos.length > 0 ? stored : null;
        setTools(loaded);
        setDraft(next);
        if (next) {
          void Promise.all([loaded.loadPosterImages(next.photos, "preview"), loaded.loadPosterLayerImages(next.composition.layers)]).then(
            ([photos, layers]) => live && setImages({ photos, layers })
          );
        }
      })
      // Without IndexedDB (a private window) there is no draft to show.
      .catch(() => live && setDraft(null));
    return () => {
      live = false;
    };
  }, [locale]);

  const size = draft && tools ? tools.sharingPosterPixelSize(draft.composition) : null;

  useEffect(() => {
    if (!scene || draft === undefined) return;
    if (!draft || !tools) {
      paintBlankPoster(scene.setPoster("sharepost:none", 0.8), t("creatorBlank"));
    } else {
      const shape = tools.sharingPosterPixelSize(draft.composition);
      const canvas = scene.setPoster("sharepost", shape.width / shape.height);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        tools.renderSharingPoster(ctx, canvas.width, canvas.height, draft.composition, draft.photos, images?.photos ?? new Map(), {
          layerImages: images?.layers,
          unavailableLabel: t("creatorPhotoMissing")
        });
      }
    }
    scene.refresh();
  }, [scene, draft, tools, images, t]);

  const ready = Boolean(draft && draft.photos.every((photo) => photo.source));
  const format = draft?.composition.export.format === "png" ? "PNG" : "JPEG";
  const openClassic = () => router.push("/sharing-poster");
  const print = async () => {
    if (!draft || !tools || !ready || state === "printing") return;
    setState("printing");
    try {
      const blob = await printPoster(scene, () => tools.exportSharingPoster(draft.composition, draft.photos));
      download(blob, `${safeFilename(draft.name, "sharing-poster")}.${format === "PNG" ? "png" : "jpg"}`);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const items = draft
    ? [
        ...(ready
          ? [{ key: "print", label: t(state === "printing" ? "creatorPrinting" : "creatorDownloadFormat", { format }), sub: size ? `${size.width} × ${size.height} PX` : "", run: () => void print() }]
          : []),
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
    if (input.kind !== "pick" || !ready) return;
    if (focus === 0) void print();
    else setFocus(0);
  });

  return (
    <>
      <BookingPanel>
        <p className={metaLabel}>{t("menuPoster")}</p>
        <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[4rem]">
          {draft ? draft.name || t("menuPoster") : draft === null ? t("creatorNoDraft") : t("creatorReading")}
        </h1>
        <div aria-hidden="true" className={styles.calloutRule} />
        {draft && (
          <p className={`${metaLabel} mt-6`}>
            {t("creatorSharepostCount", { photos: draft.photos.length })} <span aria-hidden="true" className="mx-2">／</span> {format}
          </p>
        )}
        {draft !== undefined && (
          <p className="mt-3 max-w-md text-sm text-fg-muted">
            {t(!draft ? "creatorSharepostEmptyHint" : ready ? "creatorDraftHint" : "creatorSharepostMissingHint")}
          </p>
        )}
        {draft !== undefined && (
          <GameMenu label={t("menuPoster")} className="mt-6" focus={Math.min(focus, items.length - 1)} onFocus={setFocus} items={items} />
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
