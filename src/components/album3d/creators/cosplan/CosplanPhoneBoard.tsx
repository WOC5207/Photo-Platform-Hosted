"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { CosplanImageLayer, CosplanLayer, CosplanSlot, CosplanTextLayer } from "@/lib/cosplanTypes";
import { COSPLAN_IMAGE_LIMIT, COSPLAN_TEXT_LIMIT, COSPLAN_UPLOAD_MAX_MB, cosplanUploadError, loadCosplanImage, normalizeCosplanUpload, placeCharacter, type CosplanCharacter } from "@/lib/cosplanDraft";
import { renderCosplan } from "@/lib/cosplanCanvas";
import { Roll, pad } from "../../hud";
import { fieldClass, metaLabel, secondaryClass, useStage } from "../../booking/shared";
import { ENTER, ICONS, PhoneBack, PhoneIcon, PhoneSheet, PhoneShell, PhoneToolbar, cssColor, fitCanvas, usePosterFit, usePosterMorph, useStripMotion, type PhoneTool } from "../phone";
import { fitInSlot, layerAt, layerBox, paintGuides, restackLayers, slotAt, transformLayer } from "./board";
import { NamePanel, Range, TextPanel, type LiveProps } from "./CosplanBoard";
import { useCosplanStudio } from "./CosplanStudio";

type Mode = "board" | "search" | "arrange" | "layers" | "text" | "name";
type Target = { slot: string; layer?: string } | { slot?: undefined; layer: string };
type CharacterResult = { id: number; name: string; nameCn: string; thumbnailUrl: string; imageUrl: string; sourceUrl: string };

const sameTarget = (a: Target | null, b: Target | null) => a?.slot === b?.slot && (a?.slot ? true : a?.layer === b?.layer);
const targetOf = (layer: CosplanLayer): Target => (layer.type === "image" && layer.slotId ? { slot: layer.slotId, layer: layer.id } : { layer: layer.id });

/**
 * Create Cosplan on a phone held upright: the poster flat and as wide as the
 * screen instead of on the easel, with every tool in a bar under it from the
 * start. The strip above the bar picks a slot or layer; the tools act on it:
 * find a character on Bangumi or upload one (into the picked slot, replacing
 * the character there), arrange, add text, the layer list and delete. Each
 * tool's controls open in a sheet between the poster and the bar, so the
 * poster stays in view. On the poster a tap picks, a drag moves, a pinch
 * sizes and two fingers turn the picked layer. The draft, undo history,
 * text and name panels are the easel board's.
 */
export default function CosplanPhoneBoard() {
  const t = useTranslations("album3d");
  const tc = useTranslations("cosplan");
  const locale = useLocale();
  const { go } = useStage();
  const studio = useCosplanStudio();
  const { composition, status } = studio;
  const [mode, setMode] = useState<Mode>("board");
  const [target, setTarget] = useState<Target | null>(null);
  const [notice, setNotice] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const slots = useMemo(() => composition?.slots ?? [], [composition?.slots]);
  const slotName = (slot: CosplanSlot) => (locale === "zh" ? slot.nameZh : slot.nameEn);
  const layerName = (layer: CosplanLayer) => (layer.type === "text" ? layer.text.split("\n")[0] || tc("text") : layer.name || tc("unnamedCharacter"));

  // ------------------------------------------------------------- targets --
  const targets = useMemo<Target[]>(() => {
    if (!composition) return [];
    const free = composition.layers.filter((layer) => layer.type === "text" || !slots.some((slot) => slot.id === layer.slotId));
    return [...slots.map((slot) => ({ slot: slot.id })), ...free.map((layer) => ({ layer: layer.id }))];
  }, [composition, slots]);

  // Start on the first empty slot, or the first thing there is.
  const hasDraft = composition !== null;
  useEffect(() => {
    if (target || !composition || targets.length === 0) return;
    const filled = new Set(composition.layers.flatMap((layer) => (layer.type === "image" && layer.slotId ? [layer.slotId] : [])));
    const empty = slots.find((slot) => !filled.has(slot.id));
    setTarget(empty ? { slot: empty.id } : targets[0]);
    // Only on arrival: afterwards nothing picked is a choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDraft]);

  const selected = useMemo<CosplanLayer | null>(() => {
    if (!composition || !target) return null;
    if (target.layer) {
      const layer = composition.layers.find((item) => item.id === target.layer);
      if (layer) return layer;
    }
    if (!target.slot) return null;
    return composition.layers.findLast((layer) => layer.type === "image" && layer.slotId === target.slot) ?? null;
  }, [composition, target]);
  const targetSlot = target?.slot ? (slots.find((slot) => slot.id === target.slot) ?? null) : null;

  // ------------------------------------------------------------- editing --
  const update = useCallback(
    (id: string, patch: Partial<CosplanLayer>, record = true) => {
      const current = studio.composition;
      if (!current) return;
      studio.apply({ ...current, layers: current.layers.map((layer) => (layer.id === id ? ({ ...layer, ...patch } as CosplanLayer) : layer)) }, record);
    },
    [studio]
  );
  // Sliders and fields: one undo step from press to release.
  const live = useRef(false);
  const startLive = () => {
    if (live.current) return;
    live.current = true;
    studio.begin();
  };
  const endLive = () => {
    if (!live.current) return;
    live.current = false;
    studio.discardIfUnchanged();
  };
  const liveUpdate = (id: string, patch: Partial<CosplanLayer>) => update(id, patch, !live.current);
  const liveProps = { onPointerDown: startLive, onPointerUp: endLive, onKeyDown: startLive, onKeyUp: endLive, onBlur: endLive };

  const remove = (layer: CosplanLayer) => {
    if (!composition) return;
    studio.apply({ ...composition, layers: composition.layers.filter((item) => item.id !== layer.id) });
    setTarget(layer.type === "image" && layer.slotId ? { slot: layer.slotId } : null);
    if (mode === "arrange") setMode("board");
  };
  const restack = (layer: CosplanLayer, delta: number) => {
    const layers = composition && restackLayers(composition.layers, layer, delta);
    if (composition && layers) studio.apply({ ...composition, layers });
  };
  const moveToSlot = (layer: CosplanImageLayer, slotId: string) => {
    const slot = slots.find((item) => item.id === slotId);
    if (!slot) {
      update(layer.id, { slotId: undefined, slot: undefined });
      setTarget({ layer: layer.id });
      return;
    }
    update(layer.id, fitInSlot(layer, slot));
    setTarget({ slot: slot.id, layer: layer.id });
  };

  const imageCount = composition?.layers.filter((layer) => layer.type === "image").length ?? 0;
  const textCount = composition?.layers.filter((layer) => layer.type === "text").length ?? 0;
  // A picked character is replaced by the next one found or uploaded; otherwise it goes in the picked slot.
  const replacing = selected?.type === "image" ? selected : null;

  /** Put a character on the poster: over the picked one, in the picked slot, else the first empty slot, else free. */
  const place = (character: CosplanCharacter, next: Mode = "board") => {
    const current = studio.composition;
    if (!current) return;
    if (imageCount >= COSPLAN_IMAGE_LIMIT && !replacing) {
      setNotice(t("creatorImageLimit", { count: COSPLAN_IMAGE_LIMIT }));
      setMode("board");
      return;
    }
    const filled = new Set(current.layers.flatMap((layer) => (layer.type === "image" && layer.slotId ? [layer.slotId] : [])));
    const slot = replacing ? slots.find((item) => item.id === replacing.slotId) : (targetSlot ?? slots.find((item) => !filled.has(item.id)));
    const layer = placeCharacter(current, character, slot ?? undefined);
    const kept = replacing ? current.layers.filter((item) => item.id !== replacing.id) : current.layers;
    studio.apply({ ...current, layers: [...kept, layer] });
    setTarget(slot ? { slot: slot.id, layer: layer.id } : { layer: layer.id });
    setMode(next);
    setNotice("");
  };

  const upload = async (file: File) => {
    try {
      const blob = await normalizeCosplanUpload(file);
      const src = studio.track(URL.createObjectURL(blob));
      const image = await loadCosplanImage(src);
      // A file's name is rarely the character's, so the visitor is asked for it instead.
      place({ src, blob, name: "", naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight }, "name");
    } catch (error) {
      setNotice(tc(cosplanUploadError(error), { size: COSPLAN_UPLOAD_MAX_MB }));
    }
  };

  // -------------------------------------------------------------- search --
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CharacterResult[]>([]);
  const [searched, setSearched] = useState({ query: "", page: 1, total: 0 });
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error">("idle");
  const [importing, setImporting] = useState<number | null>(null);
  const search = async (page = 1, event?: FormEvent) => {
    event?.preventDefault();
    const q = (page === 1 ? query : searched.query).trim();
    if (q.length < 2) return;
    setSearchState("loading");
    try {
      const response = await fetch(`/api/cosplan/characters/search?q=${encodeURIComponent(q)}&page=${page}`);
      if (!response.ok) throw new Error("searchFailed");
      const data = (await response.json()) as { items: CharacterResult[]; total: number };
      setResults(data.items);
      setSearched({ query: q, page, total: data.total });
      setSearchState("idle");
      // Put the keyboard away so the cards show.
      (document.activeElement as HTMLElement | null)?.blur();
    } catch {
      setSearchState("error");
    }
  };
  const importResult = async (result: CharacterResult) => {
    if (!result.imageUrl || importing !== null) return;
    setImporting(result.id);
    try {
      const response = await fetch(result.imageUrl);
      if (!response.ok) throw new Error("imageImportFailed");
      const blob = await response.blob();
      const src = studio.track(URL.createObjectURL(blob));
      const image = await loadCosplanImage(src);
      place({ src, blob, sourceUrl: result.sourceUrl, name: result.nameCn || result.name, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
    } catch {
      setSearchState("error");
    } finally {
      setImporting(null);
    }
  };

  // ---------------------------------------------------------------- text --
  const [textSession, setTextSession] = useState<{ id: string; isNew: boolean } | null>(null);
  const composing = useRef(false);
  const pendingFinish = useRef<boolean | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const editText = (layer: CosplanTextLayer, isNew = false) => {
    if (!isNew) studio.begin();
    setTextSession({ id: layer.id, isNew });
    setTarget({ layer: layer.id });
    setMode("text");
  };
  const addText = () => {
    if (!composition) return;
    if (textCount >= COSPLAN_TEXT_LIMIT) {
      setNotice(t("creatorTextLimit", { count: COSPLAN_TEXT_LIMIT }));
      return;
    }
    const layer: CosplanTextLayer = { id: crypto.randomUUID(), type: "text", name: tc("textLayer"), text: tc("newText"), x: composition.width * 0.12, y: composition.height * 0.1, width: composition.width * 0.76, rotation: 0, fontSize: Math.max(28, composition.width * 0.045), fill: "#ffffff", align: "center", bold: true, fontFamily: "Arial" };
    studio.begin();
    studio.apply({ ...composition, layers: [...composition.layers, layer] }, false);
    editText(layer, true);
  };
  const finishText = (save: boolean) => {
    if (composing.current) {
      pendingFinish.current = save;
      textRef.current?.blur();
      return;
    }
    const session = textSession;
    setTextSession(null);
    setMode("board");
    if (!session) return;
    if (!save) {
      studio.cancel();
      if (session.isNew) setTarget(null);
      return;
    }
    const layer = studio.composition?.layers.find((item) => item.id === session.id);
    // An empty new text is dropped with its undo step.
    if (session.isNew && layer?.type === "text" && !layer.text.trim()) studio.cancel();
    else studio.discardIfUnchanged();
  };
  useEffect(() => {
    if (mode !== "text") return;
    const field = textRef.current;
    field?.focus({ preventScroll: true });
    if (textSession?.isNew) field?.select();
    // Focus once when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // The name is part of placing the upload: one undo takes both back.
  const finishName = (keep: boolean) => {
    if (selected?.type === "image") update(selected.id, { name: keep ? selected.name.trim() : "" }, false);
    setMode("board");
  };

  // -------------------------------------------------------------- poster --
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // As large as the space between the bars allows.
  const size = usePosterFit(frameRef, composition ? composition.width / composition.height : 0);
  usePosterMorph(canvasRef, size);

  const [accent, setAccent] = useState("#b98b4e");
  useEffect(() => {
    if (rootRef.current) setAccent(cssColor(rootRef.current, "--color-accent", "#b98b4e"));
  }, [hasDraft]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !composition || !size.width) return;
    fitCanvas(canvas, size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = canvas.width / composition.width;
    renderCosplan(ctx, composition, studio.images, scale);
    paintGuides(ctx, composition, scale, { accent, locale, focusSlot: mode === "text" ? null : (target?.slot ?? null), selected, slots: mode !== "text" });
  }, [composition, studio.images, size, accent, locale, mode, target, selected]);

  // The text and name panels rise over the bars; the poster shrinks to stay above them.
  const [panelSpace, setPanelSpace] = useState(0);
  const typing = mode === "text" || mode === "name";
  useEffect(() => {
    if (!typing) return;
    let observer: ResizeObserver | null = null;
    let frame = 0;
    // The panel opens on the frame after it mounts, once it knows the screen is upright.
    const find = (tries: number) => {
      const panel = document.querySelector<HTMLElement>("section[role=dialog]");
      if (!panel) {
        if (tries > 0) frame = requestAnimationFrame(() => find(tries - 1));
        return;
      }
      observer = new ResizeObserver(() => setPanelSpace(panel.offsetHeight));
      observer.observe(panel);
    };
    find(30);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      setPanelSpace(0);
    };
  }, [typing]);

  // ------------------------------------------------------------ pointers --
  const gesture = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    layer: CosplanLayer | null;
    start: { x: number; y: number };
    moved: boolean;
    pinch: { distance: number; angle: number; layer: CosplanLayer } | null;
  } | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const posterXY = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || !composition || !rect.width) return null;
    return { x: ((clientX - rect.left) / rect.width) * composition.width, y: ((clientY - rect.top) / rect.height) * composition.height };
  };
  const twoFingers = (pointers: Map<number, { x: number; y: number }>) => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  };
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!composition) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const g = gesture.current;
    if (g && g.pointers.size === 1) {
      // A second finger: pinch to size and twist to turn the touched layer, or the picked one.
      const layer = g.layer ? (composition.layers.find((item) => item.id === g.layer?.id) ?? g.layer) : selected;
      if (!layer) return;
      g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (!g.moved) studio.begin();
      g.moved = true;
      g.layer = layer;
      g.pinch = { ...twoFingers(g.pointers), layer };
      return;
    }
    const at = posterXY(event.clientX, event.clientY);
    if (!at) return;
    const layer = layerAt(composition, at.x, at.y);
    gesture.current = { pointers: new Map([[event.pointerId, { x: event.clientX, y: event.clientY }]]), layer, start: at, moved: false, pinch: null };
    if (layer) setTarget(targetOf(layer));
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || !g.pointers.has(event.pointerId)) return;
    const first = g.pointers.get(event.pointerId)!;
    g.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (g.pinch && g.pointers.size === 2) {
      const now = twoFingers(g.pointers);
      update(g.pinch.layer.id, transformLayer(g.pinch.layer, now.distance / Math.max(1, g.pinch.distance), now.angle - g.pinch.angle), false);
      return;
    }
    if (!g.layer || g.pinch) return;
    if (!g.moved && Math.hypot(event.clientX - first.x, event.clientY - first.y) < 4) {
      g.pointers.set(event.pointerId, first);
      return;
    }
    const at = posterXY(event.clientX, event.clientY);
    if (!at) return;
    if (!g.moved) studio.begin();
    g.moved = true;
    update(g.layer.id, { x: g.layer.x + at.x - g.start.x, y: g.layer.y + at.y - g.start.y }, false);
  };
  const onPointerEnd = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || !g.pointers.has(event.pointerId) || !composition) return;
    g.pointers.delete(event.pointerId);
    if (g.pointers.size > 0) {
      // One finger left after a pinch: that gesture is over.
      g.layer = null;
      return;
    }
    gesture.current = null;
    if (g.moved) {
      studio.discardIfUnchanged();
      return;
    }
    if (event.type === "pointercancel") return;
    if (g.layer) {
      const double = lastTap.current && lastTap.current.id === g.layer.id && performance.now() - lastTap.current.at < 380;
      lastTap.current = { id: g.layer.id, at: performance.now() };
      if (double && g.layer.type === "text") editText(g.layer);
      return;
    }
    const slot = slotAt(composition, g.start.x, g.start.y);
    setTarget(slot ? { slot: slot.id } : null);
    if (!slot && mode === "arrange") setMode("board");
  };

  // ------------------------------------------------------------- targets --
  const stripRef = useRef<HTMLDivElement>(null);
  useStripMotion(stripRef, targets.map((item) => item.slot ?? item.layer).join(), mode === "board" || typing);
  const targetIndex = targets.findIndex((item) => sameTarget(item, target));
  // Keep the picked chip in view as picks come from the poster.
  useEffect(() => {
    const strip = stripRef.current;
    const chip = strip?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!strip || !chip) return;
    const left = chip.offsetLeft - strip.offsetLeft;
    if (left < strip.scrollLeft || left + chip.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollTo({ left: left - 12, behavior: "smooth" });
  }, [targetIndex]);

  // -------------------------------------------------------------- render --
  const back = <PhoneBack label={tc("backgrounds")} onClick={() => go({ kind: "cosplan" })} />;

  if (status === "reading" || !composition) {
    return (
      <PhoneShell rootRef={rootRef}>
        <header className="flex items-center border-b border-border-strong px-1 pt-[env(safe-area-inset-top)]">{back}</header>
        <div className="flex flex-1 flex-col items-start justify-center gap-4 px-6">
          <p className={metaLabel}>{t("menuCosplan")}</p>
          <h1 className="text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em]">{status === "reading" ? t("creatorReading") : t("creatorNoDraft")}</h1>
          {status !== "reading" && (
            <button type="button" className={`${secondaryClass} border-fg bg-fg text-page`} onClick={() => go({ kind: "cosplan" })}>{tc("chooseBackground")}</button>
          )}
        </div>
      </PhoneShell>
    );
  }

  const chipLabel = (item: Target) => {
    if (item.slot) {
      const slot = slots.find((candidate) => candidate.id === item.slot)!;
      const layer = composition.layers.findLast((candidate) => candidate.type === "image" && candidate.slotId === item.slot);
      return { top: `${pad(slots.indexOf(slot) + 1)} · ${slotName(slot)}`, main: layer ? layerName(layer) : t("creatorPhoneEmpty"), empty: !layer };
    }
    const layer = composition.layers.find((candidate) => candidate.id === item.layer)!;
    return { top: layer.type === "text" ? tc("text") : tc("freeLayer"), main: layerName(layer), empty: false };
  };

  const tools: PhoneTool[] = [
    { key: "find", label: replacing ? t("creatorPhoneReplace") : t("creatorPhoneFind"), icon: "find", active: mode === "search", run: () => setMode(mode === "search" ? "board" : "search") },
    { key: "upload", label: t("creatorPhoneUpload"), icon: "upload", run: () => uploadRef.current?.click() },
    { key: "arrange", label: t("creatorArrange"), icon: "arrange", active: mode === "arrange", disabled: !selected, run: () => setMode(mode === "arrange" ? "board" : "arrange") },
    { key: "text", label: tc("addText"), icon: "text", run: addText },
    { key: "layers", label: tc("layers"), icon: "layers", active: mode === "layers", disabled: composition.layers.length === 0, run: () => setMode(mode === "layers" ? "board" : "layers") },
    { key: "delete", label: tc("delete"), icon: "delete", disabled: !selected, run: () => selected && remove(selected) }
  ];

  const sheetTitle = mode === "search" ? (replacing ? t("creatorReplace") : t("creatorFindCharacter")) : mode === "arrange" ? t("creatorArrange") : mode === "layers" ? tc("layers") : "";
  const placeFor = replacing ? layerName(replacing) : targetSlot ? slotName(targetSlot) : t("creatorThePoster");

  return (
    <PhoneShell rootRef={rootRef}>
      <input
        ref={uploadRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
          event.currentTarget.value = "";
        }}
      />
      <header className="flex shrink-0 items-center gap-1 border-b border-border-strong px-1 pt-[env(safe-area-inset-top)]">
        {back}
        <div className="min-w-0 flex-1 px-1 text-center">
          <h1 className="font-meta truncate text-[0.6875rem] uppercase tracking-[0.12em]">{composition.templateTitle}</h1>
          <p role="status" className="font-meta truncate text-[0.625rem] text-fg-subtle">
            <Roll value={studio.saved === "saved" ? t("creatorPhoneSaved") : studio.saved === "error" ? tc("draftError") : `${composition.width} × ${composition.height} PX`} />
          </p>
        </div>
        <button type="button" aria-label={tc("undo")} title={tc("undo")} disabled={!studio.canUndo} onClick={studio.undo} className="grid h-11 w-10 shrink-0 place-items-center disabled:opacity-30">
          <PhoneIcon d={ICONS.undo} />
        </button>
        <button type="button" aria-label={tc("redo")} title={tc("redo")} disabled={!studio.canRedo} onClick={studio.redo} className="grid h-11 w-10 shrink-0 place-items-center disabled:opacity-30">
          <PhoneIcon d={ICONS.redo} />
        </button>
        <button type="button" onClick={() => go({ kind: "cosplan", step: "print" })} className="ml-1 inline-flex min-h-9 shrink-0 items-center bg-fg px-3 text-xs font-semibold uppercase tracking-[0.08em] text-page">
          {t("creatorPrint")}
        </button>
      </header>

      <div ref={frameRef} className="relative grid min-h-0 flex-1 place-items-center bg-fg/[0.04]">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={tc("canvasLabel")}
          className="block touch-none select-none shadow-[0_6px_24px_rgba(0,0,0,0.18)]"
          style={{ width: size.width, height: size.height }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
      </div>

      {typing && panelSpace > 0 ? (
        <div aria-hidden="true" className="shrink-0" style={{ height: panelSpace }} />
      ) : mode === "board" || typing ? (
        <div className={`shrink-0 border-t border-border-strong ${ENTER}`}>
          <div ref={stripRef} role="group" aria-label={t("creatorPhoneTargets")} className="flex gap-1.5 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
            {targets.map((item) => {
              const label = chipLabel(item);
              const active = sameTarget(item, target);
              return (
                <button
                  key={item.slot ?? item.layer}
                  data-motion-key={item.slot ?? item.layer}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTarget(item)}
                  className={`flex min-h-11 w-[6.5rem] shrink-0 flex-col justify-center border px-2 text-left transition-colors duration-[180ms] ${active ? "border-fg bg-fg text-page" : label.empty ? "border-dashed border-accent text-fg" : "border-border-strong text-fg"}`}
                >
                  <span className={`font-meta block truncate text-[0.625rem] uppercase tracking-[0.08em] ${active ? "text-page/75" : "text-fg-subtle"}`}>{label.top}</span>
                  <span className={`block truncate text-sm font-semibold ${label.empty && !active ? "text-accent-text" : ""}`}>{label.main}</span>
                </button>
              );
            })}
          </div>
          <p className="px-3 pb-1.5 text-[0.6875rem] leading-4 text-fg-muted">{t("creatorBoardHintTouch")}</p>
        </div>
      ) : (
        <PhoneSheet key={mode} title={sheetTitle} aside={mode === "arrange" && selected ? layerName(selected) : undefined} doneLabel={tc("doneText")} onDone={() => setMode("board")}>
          {mode === "search" && (
            <SearchSheet
              query={query}
              onQuery={setQuery}
              onSearch={(page, event) => void search(page, event)}
              state={searchState}
              searched={searched}
              results={results}
              importing={importing}
              placeFor={placeFor}
              onPick={(result) => void importResult(result)}
            />
          )}
          {mode === "arrange" && selected && (
            <ArrangeSheet
              layer={selected}
              maxWidth={composition.width * 2}
              slots={slots}
              slotName={slotName}
              liveProps={liveProps}
              onChange={(patch) => liveUpdate(selected.id, patch)}
              onTransform={(factor, turn) => liveUpdate(selected.id, transformLayer(selected, factor, turn))}
              onSlot={(slotId) => selected.type === "image" && moveToSlot(selected, slotId)}
              onRestack={(delta) => restack(selected, delta)}
              onEditText={() => selected.type === "text" && editText(selected)}
            />
          )}
          {mode === "arrange" && !selected && <p className="py-2 text-sm text-fg-muted">{tc("selectLayer")}</p>}
          {mode === "layers" && (
            <ol aria-label={tc("layers")} className="flex flex-col-reverse gap-1">
              <li className="font-meta px-3 py-2 text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">00 · {t("creatorLayerBackground")}</li>
              {composition.layers.map((layer, i) => {
                const active = layer.id === selected?.id;
                return (
                  <li key={layer.id} className={`flex items-center ${active ? "bg-fg/[0.08]" : ""}`}>
                    <button type="button" aria-current={active ? "true" : undefined} onClick={() => setTarget(targetOf(layer))} className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 px-3 text-left text-sm ${active ? "font-semibold text-fg" : "text-fg-muted"}`}>
                      <span className="font-meta w-6 text-[0.625rem] text-fg-subtle">{pad(i + 1)}</span>
                      <span className="min-w-0 flex-1 truncate">{layerName(layer)}</span>
                      <span className="font-meta shrink-0 text-[0.625rem] uppercase text-fg-subtle">{layer.type === "text" ? tc("text") : layer.slotId ? slotName(slots.find((slot) => slot.id === layer.slotId) ?? slots[0]) : tc("freeLayer")}</span>
                    </button>
                    {active && (
                      <>
                        <button type="button" aria-label={tc("bringForward")} onClick={() => restack(layer, 1)} className="grid h-11 w-10 shrink-0 place-items-center text-lg">↑</button>
                        <button type="button" aria-label={tc("sendBackward")} onClick={() => restack(layer, -1)} className="grid h-11 w-10 shrink-0 place-items-center text-lg">↓</button>
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </PhoneSheet>
      )}

      {notice && (
        <p role="alert" className={`shrink-0 border-t border-border-strong px-3 py-2 text-sm text-danger ${ENTER}`}>
          {notice}
          <button type="button" onClick={() => setNotice("")} className="ml-2 text-fg-muted underline">{tc("close")}</button>
        </p>
      )}

      <PhoneToolbar label={tc("tools")} tools={tools} hidden={typing && panelSpace > 0} onUse={() => setNotice("")} />

      {mode === "text" && selected?.type === "text" && (
        <TextPanel
          layer={selected}
          textRef={textRef}
          onChange={(patch) => update(selected.id, patch, false)}
          composing={composing}
          onCompositionEnd={() => {
            const pending = pendingFinish.current;
            pendingFinish.current = null;
            if (pending !== null) queueMicrotask(() => finishText(pending));
          }}
          onFinish={finishText}
        />
      )}
      {mode === "name" && selected?.type === "image" && (
        <NamePanel
          layer={selected}
          slot={slots.find((slot) => slot.id === selected.slotId && slot.nameText) ?? null}
          slotName={slotName}
          onChange={(name) => update(selected.id, { name }, false)}
          onFinish={finishName}
        />
      )}
    </PhoneShell>
  );
}

/** Bangumi search, with the cards in a grid: a tap places one. */
function SearchSheet({
  query,
  onQuery,
  onSearch,
  state,
  searched,
  results,
  importing,
  placeFor,
  onPick
}: {
  query: string;
  onQuery: (query: string) => void;
  onSearch: (page: number, event?: FormEvent) => void;
  state: "idle" | "loading" | "error";
  searched: { query: string; page: number; total: number };
  results: CharacterResult[];
  importing: number | null;
  placeFor: string;
  onPick: (result: CharacterResult) => void;
}) {
  const t = useTranslations("album3d");
  const tc = useTranslations("cosplan");
  return (
    <>
      <form onSubmit={(event) => onSearch(1, event)} className="sticky top-0 z-10 flex gap-2 bg-page pb-2 pt-1">
        <label className="sr-only" htmlFor="cosplan-phone-search">{tc("searchPlaceholder")}</label>
        <input id="cosplan-phone-search" type="search" enterKeyHint="search" autoComplete="off" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={tc("searchPlaceholder")} className={fieldClass} />
        <button type="submit" className={`${secondaryClass} shrink-0 px-3`} disabled={state === "loading" || query.trim().length < 2}>{state === "loading" ? tc("searching") : tc("search")}</button>
      </form>
      <p aria-live="polite" className="min-h-5 text-xs text-fg-muted">
        {state === "error"
          ? <span className="text-danger">{tc("searchError")}</span>
          : searched.query && results.length === 0 && state === "idle"
            ? tc("noResults", { query: searched.query })
            : results.length
              ? t("creatorPhoneSearchHint", { slot: placeFor })
              : ""}
      </p>
      {results.length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-2">
          {results.map((result) => (
            <li key={result.id}>
              <button type="button" disabled={!result.imageUrl || importing !== null} onClick={() => onPick(result)} className="relative block w-full text-left disabled:opacity-60">
                <span className="relative block aspect-[3/4] overflow-hidden border border-border-strong bg-fg/[0.06]">
                  {result.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                  ) : (
                    <span className="grid h-full place-items-center text-[0.625rem] text-fg-subtle">{tc("noImage")}</span>
                  )}
                  {importing === result.id && <span className="absolute inset-0 grid place-items-center bg-page/80 text-xs font-semibold">{tc("importing")}</span>}
                </span>
                <span className="mt-1 block truncate text-xs font-semibold">{result.nameCn || result.name}</span>
                {result.nameCn && <span className="block truncate text-[0.625rem] text-fg-subtle">{result.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {searched.total > 20 && (
        <div className="mt-3 flex items-center gap-3">
          <button type="button" className={secondaryClass} disabled={searched.page <= 1 || state === "loading"} onClick={() => onSearch(searched.page - 1)}>{tc("previous")}</button>
          <span className="font-meta text-xs">{searched.page}</span>
          <button type="button" className={secondaryClass} disabled={searched.page * 20 >= searched.total || state === "loading"} onClick={() => onSearch(searched.page + 1)}>{tc("next")}</button>
        </div>
      )}
      {results.length > 0 && <p className="mt-3 text-[0.6875rem] leading-4 text-fg-subtle">{tc("rightsNotice")}</p>}
    </>
  );
}

/** Size, turn, slot and crop for the picked layer; dragging and pinching on the poster still work meanwhile. */
function ArrangeSheet({
  layer,
  maxWidth,
  slots,
  slotName,
  liveProps,
  onChange,
  onTransform,
  onSlot,
  onRestack,
  onEditText
}: {
  layer: CosplanLayer;
  maxWidth: number;
  slots: CosplanSlot[];
  slotName: (slot: CosplanSlot) => string;
  liveProps: LiveProps;
  onChange: (patch: Partial<CosplanLayer>) => void;
  onTransform: (factor: number, turn: number) => void;
  onSlot: (slotId: string) => void;
  onRestack: (delta: number) => void;
  onEditText: () => void;
}) {
  const t = useTranslations("album3d");
  const tc = useTranslations("cosplan");
  const box = layerBox(layer);
  const crop = (field: "cropX" | "cropY" | "cropWidth" | "cropHeight", percent: number) => {
    if (layer.type !== "image") return;
    const value = percent / 100;
    const max = field === "cropX" ? 1 - layer.cropWidth : field === "cropY" ? 1 - layer.cropHeight : field === "cropWidth" ? 1 - layer.cropX : 1 - layer.cropY;
    const min = field === "cropWidth" || field === "cropHeight" ? 0.05 : 0;
    onChange({ [field]: Math.max(min, Math.min(max, value)) });
  };
  const slot = layer.type === "image" ? slots.find((item) => item.id === layer.slotId) : undefined;
  const small = "inline-flex min-h-11 items-center justify-center border border-border-strong px-3 text-sm";
  return (
    <div className="grid gap-2">
      {layer.type === "text" && (
        <button type="button" onClick={onEditText} className={`${secondaryClass} justify-center border-fg bg-fg text-page`}>{tc("editText")}</button>
      )}
      <Range
        label={t("creatorSize")}
        value={layer.type === "image" ? box.width : layer.fontSize}
        min={layer.type === "image" ? 24 : 10}
        max={layer.type === "image" ? maxWidth : 500}
        suffix=" PX"
        live={liveProps}
        onChange={(value) => onTransform(value / (layer.type === "image" ? box.width : layer.fontSize), 0)}
      />
      <Range label={t("creatorRotation")} value={layer.rotation} min={-180} max={180} suffix="°" live={liveProps} onChange={(value) => onTransform(1, value - layer.rotation)} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onTransform(1, -layer.rotation)} disabled={!layer.rotation} className={`${small} disabled:opacity-30`}>0°</button>
        <button type="button" onClick={() => onRestack(1)} className={small}>{tc("bringForward")}</button>
        <button type="button" onClick={() => onRestack(-1)} className={small}>{tc("sendBackward")}</button>
      </div>
      {layer.type === "image" && (
        <>
          {slots.length > 0 && (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
              <label className="grid gap-1 text-sm font-semibold text-fg-muted">
                {tc("assignedSlot")}
                <select value={layer.slotId ?? ""} onChange={(event) => onSlot(event.target.value)} className={fieldClass}>
                  <option value="">{tc("freeLayer")}</option>
                  {slots.map((item) => (
                    <option key={item.id} value={item.id}>{slotName(item)}</option>
                  ))}
                </select>
              </label>
              <button type="button" disabled={!slot} onClick={() => slot && onSlot(slot.id)} className={`${small} disabled:opacity-30`}>{t("creatorFitSlot")}</button>
            </div>
          )}
          <label className="grid gap-1 text-sm font-semibold text-fg-muted">
            {tc("characterName")}
            <input value={layer.name} maxLength={120} autoComplete="off" {...liveProps} onChange={(event) => onChange({ name: event.target.value })} className={fieldClass} />
          </label>
          {slot?.nameText && (
            <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-fg-muted">
              <input type="checkbox" checked={layer.showName !== false} onChange={(event) => onChange({ showName: event.target.checked })} />
              {tc("showCharacterName")}
            </label>
          )}
          <details className="border-t border-border-strong pt-1">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-fg-muted">{t("creatorCrop")}</summary>
            <div className="grid grid-cols-2 gap-x-4">
              {(["cropX", "cropY", "cropWidth", "cropHeight"] as const).map((field) => (
                <Range key={field} label={tc(field)} value={layer[field] * 100} min={field === "cropX" || field === "cropY" ? 0 : 5} max={100} suffix="%" live={liveProps} onChange={(value) => crop(field, value)} />
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
