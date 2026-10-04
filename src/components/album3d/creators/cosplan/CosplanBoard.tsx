"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { cosplanCharacterNames, type CosplanComposition, type CosplanImageLayer, type CosplanLayer, type CosplanSlot, type CosplanTextLayer } from "@/lib/cosplanTypes";
import { COSPLAN_IMAGE_LIMIT, COSPLAN_TEXT_LIMIT, loadCosplanImage, normalizeCosplanUpload, placeCharacter, type CosplanCharacter } from "@/lib/cosplanDraft";
import { renderCosplan, renderCosplanPart, type CosplanPart } from "@/lib/cosplanCanvas";
import { useVisualViewport } from "@/components/cosplan/useVisualViewport";
import { GameMenu, Hints, pad, wrap, type MenuItem } from "../../hud";
import styles from "../../ArchiveSite.module.css";
import { BookingPanel, fieldClass, isInteractive, metaLabel, secondaryClass, useScene, useScreenKeys, useStage, useStageDrag, useStageInput } from "../../booking/shared";
import type { PosterLayerPlane } from "../../poster";
import { LAYER_PICK, RAIL_PICK } from "../../types";
import { layerAt, layerBox, paintGuides, slotAt, transformLayer } from "./board";
import { useCosplanStudio } from "./CosplanStudio";

const FONT_OPTIONS = ["Arial", "Georgia", "Trebuchet MS", "Noto Sans SC", "Microsoft YaHei"];
const LAYER_EDGE = 640;

type Mode = "board" | "search" | "arrange" | "text" | "layers";
/** What ←/→ moves between: the template's slots, then free characters, then text. */
type Target = { slot: string; layer?: string } | { slot?: undefined; layer: string };
type CharacterResult = { id: number; name: string; nameCn: string; thumbnailUrl: string; imageUrl: string; sourceUrl: string };

const sameTarget = (a: Target | null, b: Target | null) => a?.slot === b?.slot && (a?.slot ? true : a?.layer === b?.layer);

/**
 * Create Cosplan, the board: the poster on the easel with its empty slots
 * glowing. ←/→ moves between slots and layers, and the panel's menu acts on
 * the one in focus: find a character on Bangumi (the results stand on a
 * rail under the easel), upload one, arrange it, edit text, or take the
 * poster apart into its layers. On the poster itself, a drag moves the
 * picked layer, the wheel or a pinch sizes it and two fingers turn it.
 */
export default function CosplanBoard() {
  const t = useTranslations("album3d");
  const tc = useTranslations("cosplan");
  const locale = useLocale();
  const { key, touch, go } = useStage();
  const scene = useScene("poster");
  const studio = useCosplanStudio();
  const { composition, status } = studio;
  const [mode, setMode] = useState<Mode>("board");
  const [target, setTarget] = useState<Target | null>(null);
  const [menuFocus, setMenuFocus] = useState(0);
  const [notice, setNotice] = useState("");
  const [replacing, setReplacing] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const slots = useMemo(() => composition?.slots ?? [], [composition?.slots]);
  const slotName = (slot: CosplanSlot) => (locale === "zh" ? slot.nameZh : slot.nameEn);

  // ------------------------------------------------------------- targets --
  const targets = useMemo<Target[]>(() => {
    if (!composition) return [];
    const free = composition.layers.filter((layer) => layer.type === "text" || !slots.some((slot) => slot.id === layer.slotId));
    return [...slots.map((slot) => ({ slot: slot.id })), ...free.map((layer) => ({ layer: layer.id }))];
  }, [composition, slots]);

  // Start on the first empty slot, or the first thing there is.
  useEffect(() => {
    if (target || !composition || targets.length === 0) return;
    const filled = new Set(composition.layers.flatMap((layer) => (layer.type === "image" && layer.slotId ? [layer.slotId] : [])));
    setTarget(slots.find((slot) => !filled.has(slot.id)) ? { slot: slots.find((slot) => !filled.has(slot.id))!.id } : targets[0]);
  }, [target, composition, targets, slots]);

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

  const step = (delta: number) => {
    if (!targets.length) return;
    const index = targets.findIndex((item) => sameTarget(item, target));
    setTarget(targets[wrap((index < 0 ? -delta : index) + delta, targets.length)]);
    setMenuFocus(0);
  };

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
    setTarget(layer.type === "image" && layer.slotId ? { slot: layer.slotId } : (targets[0] ?? null));
    setMode("board");
  };
  const restack = (layer: CosplanLayer, delta: number) => {
    if (!composition) return;
    const peers = composition.layers.map((item, position) => ({ item, position })).filter(({ item }) => item.type === layer.type);
    const at = peers.findIndex(({ item }) => item.id === layer.id);
    const to = peers[Math.max(0, Math.min(peers.length - 1, at + delta))]?.position;
    const from = peers[at]?.position;
    if (from === undefined || to === undefined || from === to) return;
    const layers = [...composition.layers];
    const [moved] = layers.splice(from, 1);
    layers.splice(to, 0, moved);
    studio.apply({ ...composition, layers });
  };
  const moveToSlot = (layer: CosplanImageLayer, slotId: string) => {
    const slot = slots.find((item) => item.id === slotId);
    if (!slot) return update(layer.id, { slotId: undefined, slot: undefined });
    const scale = Math.min((slot.width * 0.9) / layer.width, (slot.height * 0.9) / layer.height, 1);
    const width = layer.width * scale;
    const height = layer.height * scale;
    update(layer.id, { slotId: slot.id, slot: structuredClone(slot), x: slot.x + (slot.width - width) / 2, y: slot.y + (slot.height - height) / 2, width, height });
    setTarget({ slot: slot.id, layer: layer.id });
  };

  const imageCount = composition?.layers.filter((layer) => layer.type === "image").length ?? 0;
  const textCount = composition?.layers.filter((layer) => layer.type === "text").length ?? 0;

  // A placed character flies in from above the easel.
  const flight = useRef<{ id: string; at: number } | null>(null);

  /** Put a chosen character on the poster: in the focused slot, else free. */
  const place = (character: CosplanCharacter) => {
    const current = studio.composition;
    if (!current) return;
    if (imageCount >= COSPLAN_IMAGE_LIMIT && !replacing) {
      setNotice(t("creatorImageLimit", { count: COSPLAN_IMAGE_LIMIT }));
      return;
    }
    const filled = new Set(current.layers.flatMap((layer) => (layer.type === "image" && layer.slotId ? [layer.slotId] : [])));
    const slot = targetSlot ?? slots.find((item) => !filled.has(item.id));
    const layer = placeCharacter(current, character, slot ?? undefined);
    const kept = replacing && selected ? current.layers.filter((item) => item.id !== selected.id) : current.layers;
    studio.apply({ ...current, layers: [...kept, layer] });
    flight.current = { id: layer.id, at: performance.now() };
    setTarget(slot ? { slot: slot.id, layer: layer.id } : { layer: layer.id });
    setReplacing(false);
    setMode("board");
    setMenuFocus(0);
    setNotice("");
  };

  const upload = async (file: File) => {
    try {
      const blob = await normalizeCosplanUpload(file);
      const src = studio.track(URL.createObjectURL(blob));
      const image = await loadCosplanImage(src);
      place({ src, blob, name: file.name.replace(/\.[^.]+$/, ""), naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
    } catch {
      setNotice(tc("searchError"));
    }
  };

  // -------------------------------------------------------------- search --
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CharacterResult[]>([]);
  const [searched, setSearched] = useState({ query: "", page: 1, total: 0 });
  const [searchState, setSearchState] = useState<"idle" | "loading" | "error" | "importing">("idle");
  const [resultFocus, setResultFocus] = useState(0);
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
      setResultFocus(0);
      setSearchState("idle");
      // Hand the keys to the rail.
      (document.activeElement as HTMLElement | null)?.blur();
    } catch {
      setSearchState("error");
    }
  };
  const importResult = async (result: CharacterResult | undefined) => {
    if (!result?.imageUrl || searchState === "importing") return;
    setSearchState("importing");
    try {
      const response = await fetch(result.imageUrl);
      if (!response.ok) throw new Error("imageImportFailed");
      const blob = await response.blob();
      const src = studio.track(URL.createObjectURL(blob));
      const image = await loadCosplanImage(src);
      setSearchState("idle");
      place({ src, blob, sourceUrl: result.sourceUrl, name: result.nameCn || result.name, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight });
    } catch {
      setSearchState("error");
    }
  };
  const focusedResult = results[Math.min(resultFocus, results.length - 1)];

  useEffect(() => {
    if (!scene) return;
    // Card images load for the cards near the focus only (the image route is rate limited).
    scene.setRail(
      mode === "search" && results.length
        ? results.map((result, i) => ({
            key: `bgm-${result.id}`,
            image: Math.abs(i - resultFocus) <= 3 && result.imageUrl ? studio.image(result.imageUrl) : null,
            label: result.nameCn || result.name,
            sub: result.nameCn ? result.name : undefined
          }))
        : null,
      resultFocus
    );
  }, [scene, mode, results, resultFocus, studio]);
  useEffect(() => () => scene?.setRail(null, 0), [scene]);

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
      if (session.isNew) setTarget(targets[0] ?? null);
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

  // -------------------------------------------------------------- layers --
  const planes = useRef(new Map<string, HTMLCanvasElement>());
  const parts = useMemo<{ key: string; part: CosplanPart; label: string }[]>(() => {
    if (!composition) return [];
    const list: { key: string; part: CosplanPart; label: string }[] = [];
    let lastImage = -1;
    composition.layers.forEach((layer, i) => {
      if (layer.type === "image") lastImage = i;
    });
    composition.layers.forEach((layer, i) => {
      list.push({ key: layer.id, part: { kind: "layer", id: layer.id }, label: layer.type === "text" ? layer.text.split("\n")[0] || layer.name : layer.name });
      if (i === lastImage && composition.foregroundUrl) list.push({ key: "foreground", part: { kind: "foreground" }, label: t("creatorLayerForeground") });
    });
    if (cosplanCharacterNames(slots, composition.layers).length) list.push({ key: "names", part: { kind: "names" }, label: t("creatorLayerNames") });
    return list;
  }, [composition, slots, t]);
  const layerIndex = selected ? parts.findIndex((item) => item.key === selected.id) : -1;

  // ------------------------------------------------------------ painting --
  const frame = useRef(0);
  const paint = useCallback(() => {
    frame.current = 0;
    if (!scene || !composition) return;
    const canvas = scene.setPoster(`cosplan:${composition.templateId}`, composition.width / composition.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const scale = canvas.width / composition.width;
    if (mode === "layers") {
      renderCosplanPart(ctx, composition, studio.images, { kind: "background" }, scale);
      const edge = LAYER_EDGE / Math.max(composition.width, composition.height);
      const used = new Set<string>();
      const list: PosterLayerPlane[] = parts.map((item) => {
        let plane = planes.current.get(item.key);
        if (!plane) {
          plane = document.createElement("canvas");
          planes.current.set(item.key, plane);
        }
        plane.width = Math.round(composition.width * edge);
        plane.height = Math.round(composition.height * edge);
        const pctx = plane.getContext("2d");
        if (pctx) {
          renderCosplanPart(pctx, composition, studio.images, item.part, edge);
          // A faint sheet behind each layer, so white text off the poster still reads.
          pctx.save();
          pctx.globalCompositeOperation = "destination-over";
          pctx.fillStyle = "rgba(96, 96, 96, 0.14)";
          pctx.fillRect(0, 0, plane.width, plane.height);
          pctx.restore();
          pctx.strokeStyle = "rgba(96, 96, 96, 0.5)";
          pctx.lineWidth = 2;
          pctx.strokeRect(1, 1, plane.width - 2, plane.height - 2);
        }
        used.add(item.key);
        return { key: item.key, canvas: plane };
      });
      for (const [planeKey, plane] of planes.current) {
        if (used.has(planeKey)) continue;
        plane.width = plane.height = 1;
        planes.current.delete(planeKey);
      }
      scene.setLayers(list, layerIndex);
    } else {
      scene.setLayers(null, -1);
      // A placed character drops into place over half a second.
      let shown = composition;
      const flying = flight.current;
      if (flying) {
        const progress = Math.min(1, (performance.now() - flying.at) / 520);
        const eased = 1 - (1 - progress) ** 3;
        shown = {
          ...composition,
          layers: composition.layers.map((layer) =>
            layer.id === flying.id ? ({ ...layer, ...transformLayer(layer, 1 + (1 - eased) * 0.5, (1 - eased) * -10), y: layer.y - (1 - eased) * composition.height * 0.3 } as CosplanLayer) : layer
          )
        };
        if (progress >= 1) flight.current = null;
        else frame.current = requestAnimationFrame(() => paint());
      }
      renderCosplan(ctx, shown, studio.images, scale);
      paintGuides(ctx, shown, scale, { accent: scene.accent(), locale, focusSlot: mode === "board" ? (target?.slot ?? null) : null, selected: mode === "text" || mode === "arrange" || mode === "board" ? selected : null, slots: mode !== "text" });
    }
    scene.refresh();
  }, [scene, composition, studio.images, mode, parts, layerIndex, locale, target, selected]);
  useEffect(() => {
    if (!frame.current) frame.current = requestAnimationFrame(paint);
    return () => {
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [paint]);
  useEffect(() => () => scene?.setLayers(null, -1), [scene]);

  // ------------------------------------------------------------ pointers --
  const gesture = useRef<{
    pointers: Map<number, { x: number; y: number }>;
    layer: CosplanLayer | null;
    start: { x: number; y: number };
    moved: boolean;
    pinch: { distance: number; angle: number; layer: CosplanLayer } | null;
  } | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  // A run of wheel turns or held keys is one step to undo.
  const burstTimer = useRef(0);
  const burst = (id: string, patch: Partial<CosplanLayer>) => {
    if (!burstTimer.current) studio.begin();
    window.clearTimeout(burstTimer.current);
    burstTimer.current = window.setTimeout(() => {
      burstTimer.current = 0;
      studio.discardIfUnchanged();
    }, 450);
    update(id, patch, false);
  };
  const posterXY = (clientX: number, clientY: number, rect: DOMRect, extend = false) => {
    const uv = scene?.posterPoint(clientX, clientY, rect, extend);
    return uv && composition ? { x: uv.u * composition.width, y: uv.v * composition.height } : null;
  };
  const twoFingers = (pointers: Map<number, { x: number; y: number }>) => {
    const [a, b] = [...pointers.values()];
    return { distance: Math.hypot(b.x - a.x, b.y - a.y), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  };

  useStageDrag((input) => {
    if (!composition || (mode !== "board" && mode !== "arrange")) return false;
    const g = gesture.current;
    if (input.phase === "wheel") {
      const at = posterXY(input.clientX, input.clientY, input.rect);
      if (!at || !selected) return false;
      const factor = Math.exp(-Math.max(-120, Math.min(120, input.deltaY)) * 0.0016);
      burst(selected.id, transformLayer(selected, factor, 0));
      return true;
    }
    if (input.phase === "down") {
      if (g && g.pointers.size === 1 && g.layer) {
        // A second finger: pinch to size, twist to turn.
        g.pointers.set(input.id, { x: input.clientX, y: input.clientY });
        const current = composition.layers.find((layer) => layer.id === g.layer?.id) ?? g.layer;
        if (!g.moved) studio.begin();
        g.moved = true;
        g.pinch = { ...twoFingers(g.pointers), layer: current };
        return true;
      }
      const at = posterXY(input.clientX, input.clientY, input.rect);
      if (!at) return false;
      const layer = layerAt(composition, at.x, at.y);
      gesture.current = { pointers: new Map([[input.id, { x: input.clientX, y: input.clientY }]]), layer, start: at, moved: false, pinch: null };
      if (layer) setTarget(layer.type === "image" && layer.slotId ? { slot: layer.slotId, layer: layer.id } : { layer: layer.id });
      return true;
    }
    if (!g || !g.pointers.has(input.id)) return false;
    if (input.phase === "move") {
      const first = g.pointers.get(input.id)!;
      g.pointers.set(input.id, { x: input.clientX, y: input.clientY });
      if (g.pinch && g.pointers.size === 2) {
        const now = twoFingers(g.pointers);
        update(g.pinch.layer.id, transformLayer(g.pinch.layer, now.distance / Math.max(1, g.pinch.distance), now.angle - g.pinch.angle), false);
        return true;
      }
      if (!g.layer || g.pinch) return true;
      if (!g.moved && Math.hypot(input.clientX - first.x, input.clientY - first.y) < 4) {
        g.pointers.set(input.id, first);
        return true;
      }
      const at = posterXY(input.clientX, input.clientY, input.rect, true);
      if (!at) return true;
      if (!g.moved) studio.begin();
      g.moved = true;
      update(g.layer.id, { x: g.layer.x + at.x - g.start.x, y: g.layer.y + at.y - g.start.y }, false);
      return true;
    }
    // Up or cancel.
    g.pointers.delete(input.id);
    if (g.pointers.size > 0) {
      // One finger left after a pinch: that gesture is over.
      g.layer = null;
      return true;
    }
    gesture.current = null;
    if (g.moved) {
      studio.discardIfUnchanged();
      return true;
    }
    if (input.phase === "cancel") return true;
    if (g.layer) {
      const double = lastTap.current && lastTap.current.id === g.layer.id && performance.now() - lastTap.current.at < 380;
      lastTap.current = { id: g.layer.id, at: performance.now() };
      if (double && g.layer.type === "text") editText(g.layer);
      return true;
    }
    const slot = slotAt(composition, g.start.x, g.start.y);
    setTarget(slot ? { slot: slot.id } : null);
    setMenuFocus(0);
    if (mode === "arrange") setMode("board");
    return true;
  });

  useStageInput((input) => {
    if (mode === "search") {
      if (input.kind === "swipe" && input.x) setResultFocus((f) => Math.max(0, Math.min(results.length - 1, f + input.x)));
      else if (input.kind === "wheel") setResultFocus((f) => Math.max(0, Math.min(results.length - 1, f + input.direction)));
      else if (input.kind === "pick" && input.index >= RAIL_PICK) {
        const index = input.index - RAIL_PICK;
        if (index === resultFocus) void importResult(results[index]);
        else setResultFocus(index);
      }
    } else if (mode === "layers" && input.kind === "pick") {
      const item = input.index >= LAYER_PICK ? parts[input.index - LAYER_PICK] : null;
      const layer = item && composition?.layers.find((candidate) => candidate.id === item.key);
      if (layer) setTarget(layer.type === "image" && layer.slotId ? { slot: layer.slotId, layer: layer.id } : { layer: layer.id });
    } else if (mode === "board" && input.kind === "swipe" && input.x) step(input.x);
  });

  // --------------------------------------------------------------- menus --
  const openSearch = (replace: boolean) => {
    setReplacing(replace);
    setMode("search");
    setMenuFocus(0);
    setNotice("");
  };
  const common: MenuItem[] = [
    { key: "text", label: tc("addText"), sub: t("creatorAddTextSub"), run: addText },
    ...(composition && composition.layers.length > 0 ? [{ key: "layers", label: tc("layers"), sub: t("creatorLayersSub"), run: () => setMode("layers") }] : []),
    { key: "print", label: t("creatorPrint"), sub: t("creatorPrintSub"), run: () => go({ kind: "cosplan", step: "print" }) },
    { key: "background", label: tc("changeTemplate"), sub: t("creatorChangeBackgroundSub"), run: () => go({ kind: "cosplan" }) }
  ];
  const nameField = selected?.type === "image" && slots.find((slot) => slot.id === selected.slotId)?.nameText;
  const items: MenuItem[] = !selected
    ? [
        { key: "find", label: t("creatorFindCharacter"), sub: targetSlot ? t("creatorFindCharacterFor", { slot: slotName(targetSlot) }) : "BANGUMI", run: () => openSearch(false) },
        { key: "upload", label: tc("uploadCharacter"), sub: "JPEG / PNG / WEBP", run: () => uploadRef.current?.click() },
        ...common
      ]
    : selected.type === "image"
      ? [
          { key: "arrange", label: t("creatorArrange"), sub: t("creatorArrangeSub"), run: () => setMode("arrange") },
          { key: "replace", label: t("creatorReplace"), sub: "BANGUMI", run: () => openSearch(true) },
          ...(nameField
            ? [{ key: "name", label: tc("showCharacterName"), value: selected.showName === false ? t("creatorOff") : t("creatorOn"), run: () => update(selected.id, { showName: selected.showName === false }) }]
            : []),
          { key: "delete", label: tc("delete"), sub: selected.name, run: () => remove(selected) },
          ...common
        ]
      : [
          { key: "edit", label: tc("editText"), sub: selected.text.split("\n")[0], run: () => editText(selected) },
          { key: "arrange", label: t("creatorArrange"), sub: t("creatorArrangeSub"), run: () => setMode("arrange") },
          { key: "delete", label: tc("delete"), sub: selected.name, run: () => remove(selected) },
          ...common
        ];
  const searchItems: MenuItem[] = [
    ...(focusedResult
      ? [{ key: "place", label: searchState === "importing" ? tc("importing") : targetSlot ? t("creatorPlaceIn", { slot: slotName(targetSlot) }) : t("creatorPlaceFree"), sub: focusedResult.nameCn || focusedResult.name, run: () => void importResult(focusedResult) }]
      : []),
    { key: "upload", label: tc("uploadCharacter"), sub: "JPEG / PNG / WEBP", run: () => uploadRef.current?.click() },
    { key: "cancel", label: tc("cancelCharacter"), run: () => setMode("board") }
  ];
  const activeItems = mode === "search" ? searchItems : mode === "board" ? items : [];
  const menuAt = Math.min(menuFocus, Math.max(0, activeItems.length - 1));

  // ---------------------------------------------------------------- keys --
  const nudge = (dx: number, dy: number) => selected && burst(selected.id, { x: selected.x + dx, y: selected.y + dy });
  useScreenKeys((k, eventTarget, event) => {
    if (!composition) return false;
    if (mode === "text") {
      if (k !== "Escape") return false;
      finishText(false);
      return true;
    }
    if (mode === "board") {
      if (k === "ArrowLeft" || k === "ArrowRight") step(k === "ArrowLeft" ? -1 : 1);
      else if (k === "ArrowUp") setMenuFocus((f) => wrap(f - 1, items.length));
      else if (k === "ArrowDown") setMenuFocus((f) => wrap(f + 1, items.length));
      else if (k === "Enter" && !isInteractive(eventTarget)) items[menuAt]?.run();
      else if (k === "Delete" && selected) remove(selected);
      else if (k === "/") openSearch(false);
      else return false;
      return true;
    }
    if (mode === "search") {
      if (k === "ArrowLeft" || k === "ArrowRight") setResultFocus((f) => Math.max(0, Math.min(results.length - 1, f + (k === "ArrowLeft" ? -1 : 1))));
      else if (k === "ArrowUp") setMenuFocus((f) => wrap(f - 1, searchItems.length));
      else if (k === "ArrowDown") setMenuFocus((f) => wrap(f + 1, searchItems.length));
      else if (k === "Enter" && !isInteractive(eventTarget)) searchItems[menuAt]?.run();
      else if (k === "Escape") setMode("board");
      else return false;
      return true;
    }
    if (mode === "arrange" && selected) {
      const by = event.shiftKey ? 10 : 1;
      if (k === "ArrowLeft") nudge(-by, 0);
      else if (k === "ArrowRight") nudge(by, 0);
      else if (k === "ArrowUp") nudge(0, -by);
      else if (k === "ArrowDown") nudge(0, by);
      else if (k === "+" || k === "=") burst(selected.id, transformLayer(selected, 1.05, 0));
      else if (k === "-" || k === "_") burst(selected.id, transformLayer(selected, 1 / 1.05, 0));
      else if (k === "[" || k === "]") burst(selected.id, transformLayer(selected, 1, (k === "[" ? -1 : 1) * (by === 10 ? 1 : 5)));
      else if ((k === "Enter" && !isInteractive(eventTarget)) || k === "Escape") setMode("board");
      else return false;
      return true;
    }
    if (mode === "layers") {
      const real = parts.filter((item) => item.part.kind === "layer");
      const at = real.findIndex((item) => item.key === selected?.id);
      if (k === "ArrowLeft" || k === "ArrowRight") {
        const next = real[wrap((at < 0 ? 0 : at) + (k === "ArrowLeft" ? -1 : 1), real.length)];
        const layer = next && composition.layers.find((item) => item.id === next.key);
        if (layer) setTarget(layer.type === "image" && layer.slotId ? { slot: layer.slotId, layer: layer.id } : { layer: layer.id });
      } else if ((k === "ArrowUp" || k === "ArrowDown") && selected) restack(selected, k === "ArrowUp" ? 1 : -1);
      else if (k === "Enter" && selected && !isInteractive(eventTarget)) setMode("arrange");
      else if (k === "Escape" || k === "Enter") setMode("board");
      else return false;
      return true;
    }
    return false;
  });

  // Undo and redo, as in the classic editor.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || mode === "text") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) studio.undo();
      else if (k === "y" || (k === "z" && e.shiftKey)) studio.redo();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [studio, mode]);

  // -------------------------------------------------------------- render --
  if (status === "reading") {
    return (
      <BookingPanel>
        <p className={metaLabel}>{t("menuCosplan")}</p>
        <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em]">{t("creatorReading")}</h1>
      </BookingPanel>
    );
  }
  if (!composition) {
    return (
      <BookingPanel>
        <p className={metaLabel}>{t("menuCosplan")}</p>
        <h1 className="mt-3 text-[2.5rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em]">{t("creatorNoDraft")}</h1>
        <div aria-hidden="true" className={styles.calloutRule} />
        <GameMenu label={t("menuCosplan")} className="mt-6" focus={0} onFocus={() => undefined} items={[{ key: "choose", label: tc("chooseBackground"), run: () => go({ kind: "cosplan" }) }]} />
      </BookingPanel>
    );
  }

  const targetIndex = targets.findIndex((item) => sameTarget(item, target));
  const targetLabel = targetSlot
    ? `${t("creatorSlot")} ${pad(slots.indexOf(targetSlot) + 1)} · ${slotName(targetSlot)}`
    : selected?.type === "text"
      ? tc("text")
      : selected
        ? tc("freeLayer")
        : t("creatorNothingSelected");
  const history = (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button type="button" className={secondaryClass} disabled={!studio.canUndo} onClick={studio.undo}>{tc("undo")}</button>
      <button type="button" className={secondaryClass} disabled={!studio.canRedo} onClick={studio.redo}>{tc("redo")}</button>
      <span role="status" className="font-meta text-[0.625rem] uppercase tracking-[0.12em] text-fg-subtle">
        {studio.saved === "saved" ? tc("draftSaved") : studio.saved === "error" ? tc("draftError") : ""}
      </span>
    </div>
  );

  const hints =
    mode === "arrange"
      ? [`${t("creatorKeysArrows")} ${t("creatorHintMove")}`, `+ − ${t("creatorHintSize")}`, `[ ] ${t("creatorHintTurn")}`, `${key("confirm")} ${t("creatorHintDone")}`]
      : mode === "layers"
        ? [`${key("sides")} ${t("hintSelect")}`, `${key("move")} ${t("creatorHintRestack")}`, `${key("back")} ${t("creatorHintDone")}`]
        : mode === "search"
          ? [`${key("sides")} ${t("creatorHintTurn")}`, `${key("confirm")} ${t("creatorHintPlace")}`, `${key("back")} ${t("hintBack")}`]
          : [`${key("sides")} ${t("creatorHintSlots")}`, `${key("move")} ${t("hintSelect")}`, `${key("confirm")} ${t("hintOpen")}`, `${key("back")} ${t("hintBack")}`];

  return (
    <>
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
      {mode === "text" && selected?.type === "text" ? (
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
      ) : (
        <BookingPanel>
          <p className={metaLabel}>
            {composition.templateTitle}
            <span aria-hidden="true" className="mx-2">／</span>
            {composition.width} × {composition.height} PX
          </p>
          {mode === "board" && (
            <>
              <h1 className="mt-3 text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[2.75rem]">{selected ? selected.name || tc("text") : targetSlot ? slotName(targetSlot) : tc("characters")}</h1>
              <div aria-hidden="true" className={styles.calloutRule} />
              <p className={`${metaLabel} mt-6`}>
                {targets.length > 0 && targetIndex >= 0 && `${pad(targetIndex + 1)} / ${pad(targets.length)} · `}
                {targetLabel}
              </p>
              <p className="mt-2 max-w-md text-sm text-fg-muted">{t(touch ? "creatorBoardHintTouch" : "creatorBoardHint")}</p>
              {targets.length > 1 && (
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => step(-1)} aria-label={t("creatorPrevious")} className="min-h-11 min-w-11 border border-border-strong text-lg">‹</button>
                  <button type="button" onClick={() => step(1)} aria-label={t("creatorNext")} className="min-h-11 min-w-11 border border-border-strong text-lg">›</button>
                </div>
              )}
              <GameMenu label={t("menuCosplan")} className="mt-4" focus={menuAt} onFocus={setMenuFocus} items={items} />
              {history}
            </>
          )}
          {mode === "search" && (
            <>
              <h1 className="mt-3 text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[2.75rem]">{t("creatorFindCharacter")}</h1>
              <div aria-hidden="true" className={styles.calloutRule} />
              <form onSubmit={(event) => void search(1, event)} className="mt-6 flex gap-2">
                <label className="sr-only" htmlFor="cosplan-3d-search">{tc("searchPlaceholder")}</label>
                <input id="cosplan-3d-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tc("searchPlaceholder")} className={fieldClass} />
                <button type="submit" className={secondaryClass} disabled={searchState === "loading" || query.trim().length < 2}>{searchState === "loading" ? tc("searching") : tc("search")}</button>
              </form>
              <p aria-live="polite" className="mt-3 min-h-5 text-sm text-fg-muted">
                {searchState === "error"
                  ? <span className="text-danger">{tc("searchError")}</span>
                  : searched.query && results.length === 0 && searchState === "idle"
                    ? tc("noResults", { query: searched.query })
                    : results.length
                      ? t("creatorResults", { current: resultFocus + 1, total: results.length, slot: targetSlot ? slotName(targetSlot) : t("creatorThePoster") })
                      : ""}
              </p>
              {results.length > 1 && (
                <div className="mt-2 flex items-center gap-2">
                  <button type="button" onClick={() => setResultFocus((f) => Math.max(0, f - 1))} disabled={resultFocus === 0} aria-label={t("creatorPrevious")} className="min-h-11 min-w-11 border border-border-strong text-lg disabled:opacity-30">‹</button>
                  <button type="button" onClick={() => setResultFocus((f) => Math.min(results.length - 1, f + 1))} disabled={resultFocus >= results.length - 1} aria-label={t("creatorNext")} className="min-h-11 min-w-11 border border-border-strong text-lg disabled:opacity-30">›</button>
                  {focusedResult?.sourceUrl && <a href={focusedResult.sourceUrl} target="_blank" rel="noreferrer" className="ml-2 text-xs text-fg-subtle underline">Bangumi ↗</a>}
                </div>
              )}
              <GameMenu label={t("creatorFindCharacter")} className="mt-4" focus={menuAt} onFocus={setMenuFocus} items={searchItems} />
              {searched.total > 20 && (
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" className={secondaryClass} disabled={searched.page <= 1} onClick={() => void search(searched.page - 1)}>{tc("previous")}</button>
                  <span className="font-meta text-xs">{searched.page}</span>
                  <button type="button" className={secondaryClass} disabled={searched.page * 20 >= searched.total} onClick={() => void search(searched.page + 1)}>{tc("next")}</button>
                </div>
              )}
              {results.length > 0 && <p className="mt-4 text-xs leading-5 text-fg-subtle">{tc("rightsNotice")}</p>}
            </>
          )}
          {mode === "arrange" && selected && (
            <ArrangePanel
              layer={selected}
              composition={composition}
              slots={slots}
              slotName={slotName}
              liveProps={liveProps}
              onChange={(patch) => liveUpdate(selected.id, patch)}
              onTransform={(factor, turn) => liveUpdate(selected.id, transformLayer(selected, factor, turn))}
              onSlot={(slotId) => selected.type === "image" && moveToSlot(selected, slotId)}
              onRestack={(delta) => restack(selected, delta)}
              onDelete={() => remove(selected)}
              onDone={() => setMode("board")}
            />
          )}
          {mode === "layers" && (
            <>
              <h1 className="mt-3 text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[2.75rem]">{tc("layers")}</h1>
              <div aria-hidden="true" className={styles.calloutRule} />
              <p className="mt-6 max-w-md text-sm text-fg-muted">{t("creatorLayersHint")}</p>
              <ol aria-label={tc("layers")} className="mt-4 flex flex-col-reverse gap-1">
                <li className="font-meta px-3 py-2 text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">00 · {t("creatorLayerBackground")}</li>
                {parts.map((item, i) => {
                  const layer = composition.layers.find((candidate) => candidate.id === item.key);
                  const active = Boolean(layer && layer.id === selected?.id);
                  return (
                    <li key={item.key}>
                      {layer ? (
                        <button
                          type="button"
                          aria-current={active ? "true" : undefined}
                          onClick={() => setTarget(layer.type === "image" && layer.slotId ? { slot: layer.slotId, layer: layer.id } : { layer: layer.id })}
                          className={`flex min-h-11 w-full items-center gap-3 px-3 text-left text-sm ${active ? "bg-fg/[0.08] font-semibold text-fg" : "text-fg-muted hover:text-fg"}`}
                        >
                          <span className="font-meta w-7 text-[0.625rem] text-fg-subtle">{pad(i + 1)}</span>
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          <span className="font-meta text-[0.625rem] uppercase text-fg-subtle">{layer.type === "text" ? tc("text") : layer.slotId ? slotName(slots.find((slot) => slot.id === layer.slotId) ?? slots[0]) : tc("freeLayer")}</span>
                        </button>
                      ) : (
                        <span className="font-meta flex min-h-9 items-center gap-3 px-3 text-[0.625rem] uppercase tracking-[0.14em] text-fg-subtle">
                          <span className="w-7">{pad(i + 1)}</span>
                          {item.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className={secondaryClass} disabled={!selected} onClick={() => selected && restack(selected, 1)}>{tc("bringForward")}</button>
                <button type="button" className={secondaryClass} disabled={!selected} onClick={() => selected && restack(selected, -1)}>{tc("sendBackward")}</button>
                <button type="button" className={secondaryClass} disabled={!selected} onClick={() => setMode("arrange")}>{t("creatorArrange")}</button>
                <button type="button" className={secondaryClass} onClick={() => setMode("board")}>{tc("doneText")}</button>
              </div>
              {history}
            </>
          )}
          <p aria-live="polite" className="mt-3 min-h-5 text-sm text-danger">{notice}</p>
        </BookingPanel>
      )}
      {!touch && mode !== "text" && <Hints className={styles.menuHint} parts={hints} />}
    </>
  );
}

type LiveProps = { onPointerDown: () => void; onPointerUp: () => void; onKeyDown: () => void; onKeyUp: () => void; onBlur: () => void };

function Range({ label, value, min, max, step = 1, suffix, live, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; live: LiveProps; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="flex justify-between">
        <span className="font-semibold text-fg-muted">{label}</span>
        <span className="font-meta text-xs text-fg-subtle">{Math.round(value)}{suffix}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} {...live} onChange={(event) => onChange(Number(event.target.value))} className="h-11 w-full accent-[var(--color-accent)]" />
    </label>
  );
}

/** Size, turn and crop the selected layer; the arrow keys nudge it meanwhile. */
function ArrangePanel({
  layer,
  composition,
  slots,
  slotName,
  liveProps,
  onChange,
  onTransform,
  onSlot,
  onRestack,
  onDelete,
  onDone
}: {
  layer: CosplanLayer;
  composition: CosplanComposition;
  slots: CosplanSlot[];
  slotName: (slot: CosplanSlot) => string;
  liveProps: LiveProps;
  onChange: (patch: Partial<CosplanLayer>) => void;
  onTransform: (factor: number, turn: number) => void;
  onSlot: (slotId: string) => void;
  onRestack: (delta: number) => void;
  onDelete: () => void;
  onDone: () => void;
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
  return (
    <>
      <h1 className="mt-3 text-[2rem] font-extrabold uppercase leading-[0.95] tracking-[-0.04em] wide:text-[2.75rem]">{t("creatorArrange")}</h1>
      <div aria-hidden="true" className={styles.calloutRule} />
      <p className="mt-6 max-w-md text-sm text-fg-muted">{t("creatorArrangeHint")}</p>
      <div className="mt-4 grid gap-3">
        {layer.type === "image" && (
          <label className="grid gap-1 text-sm font-semibold text-fg-muted">
            {tc("characterName")}
            <input value={layer.name} maxLength={120} {...liveProps} onChange={(event) => onChange({ name: event.target.value })} className={fieldClass} />
          </label>
        )}
        <Range
          label={t("creatorSize")}
          value={layer.type === "image" ? box.width : layer.fontSize}
          min={layer.type === "image" ? 24 : 10}
          max={layer.type === "image" ? composition.width * 2 : 500}
          suffix=" PX"
          live={liveProps}
          onChange={(value) => onTransform(value / (layer.type === "image" ? box.width : layer.fontSize), 0)}
        />
        <Range label={t("creatorRotation")} value={layer.rotation} min={-180} max={180} suffix="°" live={liveProps} onChange={(value) => onTransform(1, value - layer.rotation)} />
        {layer.type === "image" && (
          <div className="grid grid-cols-2 gap-x-4">
            {(["cropX", "cropY", "cropWidth", "cropHeight"] as const).map((field) => (
              <Range key={field} label={tc(field)} value={layer[field] * 100} min={field === "cropX" || field === "cropY" ? 0 : 5} max={100} suffix="%" live={liveProps} onChange={(value) => crop(field, value)} />
            ))}
          </div>
        )}
        {layer.type === "image" && slots.length > 0 && (
          <label className="grid gap-1 text-sm font-semibold text-fg-muted">
            {tc("assignedSlot")}
            <select value={layer.slotId ?? ""} onChange={(event) => onSlot(event.target.value)} className={fieldClass}>
              <option value="">{tc("freeLayer")}</option>
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>{slotName(slot)}</option>
              ))}
            </select>
          </label>
        )}
        {layer.type === "image" && slots.find((slot) => slot.id === layer.slotId)?.nameText && (
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-fg-muted">
            <input type="checkbox" checked={layer.showName !== false} onChange={(event) => onChange({ showName: event.target.checked })} />
            {tc("showCharacterName")}
          </label>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={secondaryClass} onClick={() => onRestack(1)}>{tc("bringForward")}</button>
        <button type="button" className={secondaryClass} onClick={() => onRestack(-1)}>{tc("sendBackward")}</button>
        <button type="button" className={secondaryClass} onClick={onDelete}>{tc("delete")}</button>
        <button type="button" className={secondaryClass} onClick={onDone}>{tc("doneText")}</button>
      </div>
    </>
  );
}

/**
 * Text, typed in a panel while it changes on the poster. On phones the panel
 * follows the visual viewport so the keyboard never covers it, and finishing
 * waits for an input method to commit its composition, as the classic
 * editor's inline editor does.
 */
function TextPanel({
  layer,
  textRef,
  composing,
  onChange,
  onCompositionEnd,
  onFinish
}: {
  layer: CosplanTextLayer;
  textRef: React.RefObject<HTMLTextAreaElement | null>;
  composing: React.MutableRefObject<boolean>;
  onChange: (patch: Partial<CosplanTextLayer>) => void;
  onCompositionEnd: () => void;
  onFinish: (save: boolean) => void;
}) {
  const t = useTranslations("album3d");
  const tc = useTranslations("cosplan");
  const viewport = useVisualViewport();
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-aspect-ratio: 105/100)");
    const sync = () => setPortrait(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  const form = (
    <div className="grid gap-3">
      <p className={metaLabel}>{tc("text")}</p>
      <label className="sr-only" htmlFor="cosplan-3d-text">{tc("content")}</label>
      <textarea
        id="cosplan-3d-text"
        ref={textRef}
        value={layer.text}
        placeholder={tc("textPlaceholder")}
        rows={3}
        onChange={(event) => onChange({ text: event.target.value })}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={(event) => {
          composing.current = false;
          onChange({ text: event.currentTarget.value });
          onCompositionEnd();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            event.stopPropagation();
            onFinish(false);
          }
        }}
        className={`${fieldClass} min-h-24 resize-y`}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-3">
        <label className="grid gap-1 text-sm font-semibold text-fg-muted">
          {tc("font")}
          <select value={layer.fontFamily} onChange={(event) => onChange({ fontFamily: event.target.value })} className={fieldClass}>
            {FONT_OPTIONS.map((font) => (
              <option key={font}>{font}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-semibold text-fg-muted">
          {tc("color")}
          <input type="color" value={layer.fill} onChange={(event) => onChange({ fill: event.target.value })} className="h-11 w-full border border-border-strong bg-page/80 p-1" />
        </label>
      </div>
      <label className="grid gap-1 text-sm font-semibold text-fg-muted">
        <span className="flex justify-between">
          {tc("fontSize")}
          <span className="font-meta text-xs text-fg-subtle">{Math.round(layer.fontSize)} PX</span>
        </span>
        <input type="range" min="10" max="500" value={layer.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) })} className="h-11 w-full accent-[var(--color-accent)]" />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {(["left", "center", "right"] as const).map((align) => (
          <button key={align} type="button" aria-pressed={layer.align === align} onClick={() => onChange({ align })} className={`${secondaryClass} ${layer.align === align ? "border-fg bg-fg/[0.06]" : ""}`}>
            {tc(align === "left" ? "alignLeft" : align === "center" ? "alignCenter" : "alignRight")}
          </button>
        ))}
        <label className="flex min-h-11 items-center gap-2 px-2 text-sm font-semibold">
          <input type="checkbox" checked={layer.bold} onChange={(event) => onChange({ bold: event.target.checked })} />
          {tc("bold")}
        </label>
      </div>
      <p className="text-xs text-fg-subtle">{tc("liveTextHint")}</p>
      <div className="flex justify-between gap-2">
        <button type="button" className={secondaryClass} onPointerDown={(event) => event.preventDefault()} onClick={() => onFinish(false)}>{tc("cancelText")}</button>
        <button type="button" className={`${secondaryClass} border-fg bg-fg text-page`} onPointerDown={(event) => event.preventDefault()} onClick={() => onFinish(true)}>{tc("doneText")}</button>
      </div>
      <span className="sr-only">{t("creatorTextHint")}</span>
    </div>
  );
  if (!portrait) return <BookingPanel>{form}</BookingPanel>;
  // Above the on-screen keyboard: the sheet sits at the bottom of what is visible.
  return createPortal(
    <div className="pointer-events-none fixed z-50 flex flex-col justify-end" style={{ left: viewport.left, top: viewport.top, width: viewport.width, height: viewport.height }}>
      <section
        role="dialog"
        aria-label={tc("editText")}
        className="pointer-events-auto max-h-[70%] overflow-y-auto border-t border-border-strong bg-page/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur"
      >
        {form}
      </section>
    </div>,
    document.querySelector<HTMLElement>("[data-dialog-portal-root]") ?? document.body
  );
}
