"use client";

import Konva from "konva";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import { useLocale, useTranslations } from "next-intl";
import Button, { buttonClasses } from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { controlClasses } from "@/components/ui/Field";
import { normalizeCosplanLayerOrder, parseCosplanSlots, type CosplanComposition, type CosplanImageLayer, type CosplanLayer, type CosplanSlot, type CosplanTemplateSummary, type CosplanTextLayer } from "@/lib/cosplanTypes";

const DB_NAME = "photo-platform-cosplan";
const STORE_NAME = "drafts";
const DRAFT_KEY = "current";
const IMAGE_LIMIT = 20;
const TEXT_LIMIT = 30;
const FONT_OPTIONS = ["Arial", "Georgia", "Trebuchet MS", "Noto Sans SC", "Microsoft YaHei"];

type CharacterResult = { id: number; name: string; nameCn: string; thumbnailUrl: string; imageUrl: string; sourceUrl: string };
type PendingCharacter = {
  src: string;
  blob?: Blob;
  sourceUrl?: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
};

const CanvasLayoutContext = createContext<{
  slots: CosplanSlot[];
  foreground: HTMLImageElement | null;
  width: number;
  height: number;
}>({ slots: [], foreground: null, width: 0, height: 0 });

function supportedDraft(value: unknown): value is CosplanComposition {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<CosplanComposition>;
  if (
    (draft.version !== 1 && draft.version !== 2) ||
    typeof draft.templateId !== "string" ||
    typeof draft.templateTitle !== "string" ||
    typeof draft.assetToken !== "string" ||
    typeof draft.backgroundUrl !== "string" ||
    !Number.isInteger(draft.width) ||
    !Number.isInteger(draft.height) ||
    (draft.width ?? 0) < 320 ||
    (draft.height ?? 0) < 320 ||
    (draft.width ?? 0) > 4096 ||
    (draft.height ?? 0) > 4096 ||
    (draft.width ?? 0) * (draft.height ?? 0) > 12_000_000 ||
    !Array.isArray(draft.layers) ||
    draft.layers.length > IMAGE_LIMIT + TEXT_LIMIT
  ) return false;
  if (draft.version === 2) {
    if (!Array.isArray(draft.slots)) return false;
    if (parseCosplanSlots(draft.slots, draft.width as number, draft.height as number).length !== draft.slots.length) return false;
  }
  return draft.layers.every((layer) => {
    if (!layer || typeof layer !== "object" || typeof layer.id !== "string" || typeof layer.name !== "string") return false;
    const numeric = [layer.x, layer.y, layer.width, layer.rotation];
    if (!numeric.every(Number.isFinite)) return false;
    if (layer.type === "text") return typeof layer.text === "string" && Number.isFinite(layer.fontSize) && typeof layer.fill === "string";
    return layer.type === "image" && Number.isFinite(layer.height) && [layer.cropX, layer.cropY, layer.cropWidth, layer.cropHeight].every(Number.isFinite);
  });
}

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readDraft(): Promise<CosplanComposition | null> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(DRAFT_KEY);
    request.onsuccess = () => resolve(supportedDraft(request.result) ? request.result : null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

async function writeDraft(draft: CosplanComposition): Promise<void> {
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft, DRAFT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function clearDraft(): Promise<void> {
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(DRAFT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

function useCanvasImage(src: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return setImage(null);
    const element = new window.Image();
    element.decoding = "async";
    element.onload = () => setImage(element);
    element.onerror = () => setImage(null);
    element.src = src;
    return () => { element.onload = null; element.onerror = null; };
  }, [src]);
  return image;
}

function loadBrowserImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("imageLoadFailed"));
    image.src = src;
  });
}

function SlotClip({ slot, children }: { slot: CosplanSlot; children: ReactNode }) {
  if (!slot.shape) {
    return <Group clipX={slot.x} clipY={slot.y} clipWidth={slot.width} clipHeight={slot.height}>{children}</Group>;
  }
  return (
    <Group clipFunc={(context) => {
      context.beginPath();
      for (const contour of slot.shape?.contours ?? []) {
        contour.forEach((point, index) => {
          const x = slot.x + point.x * slot.width;
          const y = slot.y + point.y * slot.height;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
      }
    }}>
      {children}
    </Group>
  );
}

function CanvasImage({ layer, selected, onSelect, onChange }: {
  layer: CosplanImageLayer;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<CosplanImageLayer>) => void;
}) {
  const layout = useContext(CanvasLayoutContext);
  const image = useCanvasImage(layer.src);
  const slot = layer.slot ?? layout.slots.find((item) => item.id === layer.slotId);
  const crop = image ? {
    x: image.naturalWidth * layer.cropX,
    y: image.naturalHeight * layer.cropY,
    width: image.naturalWidth * layer.cropWidth,
    height: image.naturalHeight * layer.cropHeight
  } : undefined;
  const character = <KonvaImage id={`cosplan-${layer.id}`} image={image ?? undefined} crop={crop} x={layer.x} y={layer.y} width={layer.width} height={layer.height} rotation={layer.rotation} draggable onClick={onSelect} onTap={onSelect} shadowColor={selected ? "#000" : undefined} shadowBlur={selected ? 8 : 0} shadowOpacity={0.16} onDragEnd={(event) => onChange({ x: event.target.x(), y: event.target.y() })} onTransformEnd={(event) => {
    const node = event.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    onChange({ x: node.x(), y: node.y(), width: Math.max(24, node.width() * scaleX), height: Math.max(24, node.height() * scaleY), rotation: node.rotation() });
  }} />;
  return <>
    {slot ? <SlotClip slot={slot}>{character}</SlotClip> : character}
    {layer.drawForeground && layout.foreground && <KonvaImage image={layout.foreground} width={layout.width} height={layout.height} listening={false} perfectDrawEnabled={false} />}
  </>;
}

function CanvasText({ layer, onSelect, onChange }: {
  layer: CosplanTextLayer;
  onSelect: () => void;
  onChange: (patch: Partial<CosplanTextLayer>) => void;
}) {
  return <Text id={`cosplan-${layer.id}`} text={layer.text} x={layer.x} y={layer.y} width={layer.width} rotation={layer.rotation} fontSize={layer.fontSize} fill={layer.fill} align={layer.align} fontStyle={layer.bold ? "bold" : "normal"} fontFamily={layer.fontFamily} lineHeight={1.15} draggable onClick={onSelect} onTap={onSelect} onDragEnd={(event) => onChange({ x: event.target.x(), y: event.target.y() })} onTransformEnd={(event) => {
    const node = event.target;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1); node.scaleY(1);
    onChange({ x: node.x(), y: node.y(), width: Math.max(80, node.width() * scaleX), fontSize: Math.max(10, layer.fontSize * scaleY), rotation: node.rotation() });
  }} />;
}

function numberValue(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function CosplanEditor({ templates }: { templates: CosplanTemplateSummary[] }) {
  const t = useTranslations("cosplan");
  const locale = useLocale();
  const [composition, setComposition] = useState<CosplanComposition | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [past, setPast] = useState<CosplanComposition[]>([]);
  const [future, setFuture] = useState<CosplanComposition[]>([]);
  const [draftAvailable, setDraftAvailable] = useState<CosplanComposition | null>(null);
  const [draftStatus, setDraftStatus] = useState<"idle" | "saved" | "error">("idle");
  const [search, setSearch] = useState("");
  const [searchPage, setSearchPage] = useState(1);
  const [searchResults, setSearchResults] = useState<CharacterResult[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [lastSearch, setLastSearch] = useState("");
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [importingId, setImportingId] = useState<number | null>(null);
  const [pendingCharacter, setPendingCharacter] = useState<PendingCharacter | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"background" | "character" | "text" | "layers" | "export" | null>(null);
  const [zoom, setZoom] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches ? 0.6 : 1
  );
  const [containerWidth, setContainerWidth] = useState(700);
  const [exporting, setExporting] = useState(false);
  const [exportFailed, setExportFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const background = useCanvasImage(composition?.backgroundUrl ?? "");
  const foreground = useCanvasImage(composition?.foregroundUrl ?? "");
  const selected = composition?.layers.find((layer) => layer.id === selectedId) ?? null;
  const slots = composition?.slots ?? [];

  useEffect(() => { readDraft().then(setDraftAvailable).catch(() => setDraftStatus("error")); }, []);
  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(Math.max(280, entry.contentRect.width - 32)));
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!composition) return;
    const timer = window.setTimeout(() => {
      const stored = structuredClone(composition);
      for (const layer of stored.layers) if (layer.type === "image" && layer.blob) layer.src = "";
      writeDraft(stored).then(() => setDraftStatus("saved")).catch(() => setDraftStatus("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [composition]);
  useEffect(() => {
    const transformer = transformerRef.current;
    const stage = stageRef.current;
    if (!transformer || !stage || !selectedId) { transformer?.nodes([]); transformer?.getLayer()?.batchDraw(); return; }
    const node = stage.findOne(`#cosplan-${selectedId}`);
    transformer.nodes(node ? [node] : []);
    transformer.getLayer()?.batchDraw();
  }, [selectedId, composition?.layers]);
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!selectedId || !composition || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) return;
      const delta = event.shiftKey ? 10 : 1;
      const offset = event.key === "ArrowLeft" ? [-delta, 0] : event.key === "ArrowRight" ? [delta, 0] : event.key === "ArrowUp" ? [0, -delta] : event.key === "ArrowDown" ? [0, delta] : null;
      if (!offset) return;
      event.preventDefault();
      updateLayer(selectedId, { x: (selected?.x ?? 0) + offset[0], y: (selected?.y ?? 0) + offset[1] });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const fitScale = composition ? Math.min(1, containerWidth / composition.width, 680 / composition.height) : 1;
  const displayScale = fitScale * zoom;
  const imageCount = composition?.layers.filter((layer) => layer.type === "image").length ?? 0;
  const textCount = composition?.layers.filter((layer) => layer.type === "text").length ?? 0;

  function apply(next: CosplanComposition, record = true) {
    if (record && composition) setPast((items) => [...items.slice(-49), structuredClone(composition)]);
    if (record) setFuture([]);
    setComposition({ ...next, layers: normalizeCosplanLayerOrder(next.layers), updatedAt: Date.now() });
  }

  function updateLayer(id: string, patch: Partial<CosplanLayer>) {
    if (!composition) return;
    apply({ ...composition, layers: composition.layers.map((layer) => layer.id === id ? { ...layer, ...patch } as CosplanLayer : layer) });
  }

  function updateCrop(layer: CosplanImageLayer, field: "cropX" | "cropY" | "cropWidth" | "cropHeight", rawValue: string) {
    const requested = numberValue(rawValue, layer[field] * 100) / 100;
    const maximum = field === "cropX"
      ? 1 - layer.cropWidth
      : field === "cropY"
        ? 1 - layer.cropHeight
        : field === "cropWidth"
          ? 1 - layer.cropX
          : 1 - layer.cropY;
    const minimum = field === "cropWidth" || field === "cropHeight" ? 0.05 : 0;
    updateLayer(layer.id, { [field]: Math.max(minimum, Math.min(maximum, requested)) });
  }

  function chooseTemplate(template: CosplanTemplateSummary) {
    if (composition?.layers.length && !window.confirm(t("changeTemplateConfirm"))) return;
    const scaleX = composition ? template.width / composition.width : 1;
    const scaleY = composition ? template.height / composition.height : 1;
    const contentScale = Math.min(scaleX, scaleY);
    const layers = composition?.layers.map((layer) => {
      if (layer.type === "text") {
        return { ...layer, x: layer.x * scaleX, y: layer.y * scaleY, width: layer.width * scaleX, fontSize: layer.fontSize * contentScale };
      }
      const slot = layer.slotId ? template.slots.find((item) => item.id === layer.slotId) : undefined;
      return { ...layer, slotId: slot?.id, slot: slot ? structuredClone(slot) : undefined, x: layer.x * scaleX, y: layer.y * scaleY, width: layer.width * contentScale, height: layer.height * contentScale };
    }) ?? [];
    apply({
      version: 2,
      templateId: template.id,
      templateTitle: template.title,
      assetToken: template.assetToken,
      backgroundUrl: template.imageUrl,
      foregroundToken: template.foregroundToken,
      foregroundUrl: template.foregroundUrl,
      layoutVersion: template.layoutVersion,
      slots: structuredClone(template.slots),
      width: template.width,
      height: template.height,
      layers,
      updatedAt: Date.now()
    });
    setPendingCharacter(null);
    setSelectedId(null);
  }

  async function restore() {
    if (!draftAvailable) return;
    const restored = structuredClone(draftAvailable);
    for (const layer of restored.layers) if (layer.type === "image" && layer.blob) layer.src = URL.createObjectURL(layer.blob);
    setComposition({ ...restored, layers: normalizeCosplanLayerOrder(restored.layers) });
    setDraftAvailable(null);
  }

  async function startNew() {
    if (composition?.layers.length && !window.confirm(t("startNewConfirm"))) return;
    await clearDraft().catch(() => {});
    setDraftAvailable(null);
    setComposition(null);
    setPast([]); setFuture([]); setSelectedId(null);
  }

  function insertCharacter(character: PendingCharacter, slot?: CosplanSlot) {
    if (!composition || imageCount >= IMAGE_LIMIT) return;
    const maxWidth = slot ? slot.width * 0.9 : composition.width * 0.55;
    const maxHeight = slot ? slot.height * 0.9 : composition.height * 0.65;
    const ratio = Math.min(maxWidth / character.naturalWidth, maxHeight / character.naturalHeight, 1);
    const width = character.naturalWidth * ratio;
    const height = character.naturalHeight * ratio;
    const layer: CosplanImageLayer = {
      id: crypto.randomUUID(),
      type: "image",
      name: character.name,
      src: character.src,
      blob: character.blob,
      sourceUrl: character.sourceUrl,
      slotId: slot?.id,
      slot: slot ? structuredClone(slot) : undefined,
      x: slot ? slot.x + (slot.width - width) / 2 : composition.width * 0.22,
      y: slot ? slot.y + (slot.height - height) / 2 : composition.height * 0.15,
      width,
      height,
      rotation: 0,
      cropX: 0,
      cropY: 0,
      cropWidth: 1,
      cropHeight: 1
    };
    apply({ ...composition, layers: [...composition.layers, layer] });
    setSelectedId(layer.id);
    setPendingCharacter(null);
    setMobilePanel(null);
  }

  async function addImage(src: string, name: string, sourceUrl?: string, blob?: Blob) {
    if (!composition || imageCount >= IMAGE_LIMIT) return;
    try {
      const image = await loadBrowserImage(src);
      const character = { src, name, sourceUrl, blob, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
      if (slots.length) {
        setPendingCharacter(character);
        setSelectedId(null);
      } else {
        insertCharacter(character);
        setMobilePanel(null);
      }
    } catch { setSearchStatus("error"); }
  }

  async function uploadCharacter(file: File) {
    if (!composition || !["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 15 * 1024 * 1024) return setSearchStatus("error");
    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = await loadBrowserImage(sourceUrl);
      const scale = Math.min(1, 4096 / image.naturalWidth, 4096 / image.naturalHeight, Math.sqrt(12_000_000 / (image.naturalWidth * image.naturalHeight)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const normalized = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("normalizeFailed")), "image/webp", 0.92));
      URL.revokeObjectURL(sourceUrl);
      await addImage(URL.createObjectURL(normalized), file.name.replace(/\.[^.]+$/, ""), undefined, normalized);
    } catch { URL.revokeObjectURL(sourceUrl); setSearchStatus("error"); }
  }

  async function addCharacterResult(result: CharacterResult) {
    if (!composition || importingId !== null) return;
    setImportingId(result.id);
    setSearchStatus("idle");
    try {
      const response = await fetch(result.imageUrl);
      if (!response.ok) throw new Error("imageImportFailed");
      const blob = await response.blob();
      const src = URL.createObjectURL(blob);
      await addImage(src, result.nameCn || result.name, result.sourceUrl, blob);
    } catch {
      setSearchStatus("error");
    } finally {
      setImportingId(null);
    }
  }

  function addText() {
    if (!composition || textCount >= TEXT_LIMIT) return;
    const layer: CosplanTextLayer = { id: crypto.randomUUID(), type: "text", name: t("textLayer"), text: t("newText"), x: composition.width * 0.12, y: composition.height * 0.1, width: composition.width * 0.76, rotation: 0, fontSize: Math.max(28, composition.width * 0.045), fill: "#ffffff", align: "center", bold: true, fontFamily: "Arial" };
    apply({ ...composition, layers: [...composition.layers, layer] }); setSelectedId(layer.id);
  }

  function removeLayer(id: string) {
    if (!composition) return;
    apply({ ...composition, layers: composition.layers.filter((layer) => layer.id !== id) }); setSelectedId(null);
  }

  function duplicateLayer(layer: CosplanLayer) {
    if (!composition || (layer.type === "image" ? imageCount >= IMAGE_LIMIT : textCount >= TEXT_LIMIT)) return;
    const copy = { ...layer, id: crypto.randomUUID(), name: `${layer.name} ${t("copy")}`, x: layer.x + 24, y: layer.y + 24 };
    apply({ ...composition, layers: [...composition.layers, copy] }); setSelectedId(copy.id);
  }

  function reorderLayer(id: string, delta: number) {
    if (!composition) return;
    const index = composition.layers.findIndex((layer) => layer.id === id);
    const current = composition.layers[index];
    if (!current) return;
    const sameType = composition.layers.map((layer, position) => ({ layer, position })).filter((item) => item.layer.type === current.type);
    const typeIndex = sameType.findIndex((item) => item.position === index);
    const targetTypeIndex = Math.max(0, Math.min(sameType.length - 1, typeIndex + delta));
    const target = sameType[targetTypeIndex]?.position ?? index;
    if (index < 0 || target === index) return;
    const layers = [...composition.layers]; const [layer] = layers.splice(index, 1); layers.splice(target, 0, layer);
    apply({ ...composition, layers });
  }

  function moveImageToSlot(layer: CosplanImageLayer, slotId: string) {
    if (!composition) return;
    const slot = slots.find((item) => item.id === slotId);
    if (!slot) {
      updateLayer(layer.id, { slotId: undefined, slot: undefined });
      return;
    }
    const scale = Math.min(slot.width * 0.9 / layer.width, slot.height * 0.9 / layer.height, 1);
    const width = layer.width * scale;
    const height = layer.height * scale;
    updateLayer(layer.id, {
      slotId: slot.id,
      slot: structuredClone(slot),
      x: slot.x + (slot.width - width) / 2,
      y: slot.y + (slot.height - height) / 2,
      width,
      height
    });
  }

  function undo() {
    const previous = past.at(-1); if (!previous || !composition) return;
    setFuture((items) => [structuredClone(composition), ...items].slice(0, 50)); setPast((items) => items.slice(0, -1)); setComposition(previous); setSelectedId(null);
  }
  function redo() {
    const next = future[0]; if (!next || !composition) return;
    setPast((items) => [...items, structuredClone(composition)].slice(-50)); setFuture((items) => items.slice(1)); setComposition(next); setSelectedId(null);
  }

  async function performSearch(page = 1) {
    const query = search.trim(); if (query.length < 2) return;
    setSearchStatus("loading");
    try {
      const response = await fetch(`/api/cosplan/characters/search?q=${encodeURIComponent(query)}&page=${page}`);
      if (!response.ok) throw new Error("searchFailed");
      const result = await response.json() as { items: CharacterResult[]; total: number };
      setSearchResults(result.items); setSearchTotal(result.total); setSearchPage(page); setLastSearch(query); setSearchStatus("idle");
    } catch { setSearchStatus("error"); }
  }

  async function exportPng() {
    const stage = stageRef.current;
    if (!stage || !composition) return;
    setExporting(true); setExportFailed(false); setSelectedId(null);
    const transformer = transformerRef.current;
    try {
      await Promise.all([
        loadBrowserImage(composition.backgroundUrl),
        ...(composition.foregroundUrl ? [loadBrowserImage(composition.foregroundUrl)] : []),
        ...composition.layers.filter((layer): layer is CosplanImageLayer => layer.type === "image").map((layer) => loadBrowserImage(layer.src))
      ]);
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      transformer?.hide(); stage.draw();
      const blob = await stage.toBlob({ mimeType: "image/png", pixelRatio: 1 / displayScale });
      if (!blob) throw new Error("exportFailed");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `cosplan-${Date.now()}.png`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      setExportFailed(true);
    } finally { transformer?.show(); stage.draw(); setExporting(false); }
  }

  const backgroundTools = <div className="flex flex-col gap-3"><h2 className="font-display text-xl font-semibold">{t("backgrounds")}</h2><div className="grid grid-cols-2 gap-3">{templates.map((template, index) => <button key={template.id} type="button" onClick={() => { chooseTemplate(template); setMobilePanel(null); }} className={`group overflow-hidden rounded-xl border text-left transition ${composition?.assetToken === template.assetToken ? "border-accent bg-accent-surface" : "border-border bg-surface hover:border-accent/40"}`}><span className="relative block aspect-[4/5] overflow-hidden bg-control"><img src={template.imageUrl} alt="" className="h-full w-full object-cover" /><span className="font-meta absolute left-2 top-2 rounded bg-black/65 px-2 py-1 text-[0.625rem] text-white">{String(index + 1).padStart(2, "0")}</span></span><span className="block truncate p-3 text-sm font-semibold">{template.title}</span></button>)}</div></div>;

  const characterTools = (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold">{t("characters")}</h2>
        {slots.length > 0 && <p className="mt-1 text-sm leading-6 text-fg-subtle">{t("characterSlotHint")}</p>}
      </div>
      {pendingCharacter && (
        <div className="rounded-xl border border-accent/35 bg-accent-surface p-3">
          <p className="text-sm font-semibold">{t("chooseSlotFor", { name: pendingCharacter.name })}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {slots.map((slot, index) => (
              <Button key={slot.id} variant="primary" onClick={() => insertCharacter(pendingCharacter, slot)}>
                <span className="font-meta text-[0.625rem]">{String(index + 1).padStart(2, "0")}</span>
                {locale === "zh" ? slot.nameZh : slot.nameEn}
              </Button>
            ))}
          </div>
          <Button variant="ghost" size="compact" className="mt-2" onClick={() => setPendingCharacter(null)}>{t("cancelCharacter")}</Button>
        </div>
      )}
      <form onSubmit={(event) => { event.preventDefault(); void performSearch(1); }} className="flex gap-2">
        <input value={search} onChange={(event) => setSearch(event.target.value)} className={controlClasses} placeholder={t("searchPlaceholder")} />
        <Button type="submit" variant="primary" disabled={searchStatus === "loading"}>{searchStatus === "loading" ? t("searching") : t("search")}</Button>
      </form>
      <label className={buttonClasses({ variant: "secondary", className: "cursor-pointer" })}>
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCharacter(file); event.currentTarget.value = ""; }} />
        {t("uploadCharacter")}
      </label>
      {searchStatus === "error" && <p role="alert" className="text-sm text-danger">{t("searchError")}</p>}
      {searchStatus === "idle" && lastSearch && searchResults.length === 0 && <p role="status" className="text-sm text-fg-subtle">{t("noResults", { query: lastSearch })}</p>}
      <ul className="grid gap-2">
        {searchResults.map((result) => (
          <li key={result.id} className="grid grid-cols-[4rem_1fr] gap-3 rounded-lg border border-border bg-surface p-2">
            {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" className="ui-image-frame aspect-square w-16 rounded-md object-cover" /> : <span className="ui-image-frame flex aspect-square w-16 items-center justify-center rounded-md bg-control text-center text-[0.625rem] text-fg-subtle">{t("noImage")}</span>}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{result.nameCn || result.name}</p>
              {result.nameCn && <p className="truncate text-xs text-fg-subtle">{result.name}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={!result.imageUrl || importingId !== null} onClick={() => void addCharacterResult(result)} className="min-h-11 text-sm font-semibold text-accent-text disabled:opacity-50">{importingId === result.id ? t("importing") : slots.length ? t("chooseCharacter") : t("add")}</button>
                <a href={result.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs text-fg-subtle underline">Bangumi ↗</a>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {searchResults.length > 0 && <p className="text-xs leading-5 text-fg-subtle">{t("rightsNotice")}</p>}
      {searchTotal > 20 && <div className="flex justify-between"><Button size="compact" disabled={searchPage <= 1} onClick={() => void performSearch(searchPage - 1)}>{t("previous")}</Button><span className="font-meta text-xs text-fg-subtle">{searchPage}</span><Button size="compact" disabled={searchPage * 20 >= searchTotal} onClick={() => void performSearch(searchPage + 1)}>{t("next")}</Button></div>}
    </div>
  );

  const textTools = <div className="flex flex-col gap-4"><h2 className="font-display text-xl font-semibold">{t("text")}</h2><p className="text-sm text-fg-subtle">{t("textHint")}</p><Button variant="primary" onClick={addText} disabled={!composition || textCount >= TEXT_LIMIT}>{t("addText")}</Button></div>;

  const layerTools = (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">{t("layers")}</h2>
      {!composition?.layers.length ? <p className="text-sm text-fg-subtle">{t("noLayers")}</p> : (
        <ul className="flex flex-col-reverse gap-2">
          {composition.layers.map((layer, index) => {
            const slot = layer.type === "image" ? slots.find((item) => item.id === layer.slotId) : null;
            return <li key={layer.id}>
              <button type="button" onClick={() => setSelectedId(layer.id)} className={`flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 text-left ${selectedId === layer.id ? "border-accent bg-accent-surface" : "border-border bg-surface"}`}>
                <span className="font-meta text-[0.625rem] text-fg-faint">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{layer.name}</span>
                <span className="max-w-24 truncate text-xs text-fg-subtle">{slot ? (locale === "zh" ? slot.nameZh : slot.nameEn) : layer.type === "image" ? t("freeLayer") : t("text")}</span>
              </button>
            </li>;
          })}
        </ul>
      )}
      {selected?.type === "image" && slots.length > 0 && (
        <label className="text-sm font-semibold text-fg-muted">
          {t("assignedSlot")}
          <select value={selected.slotId ?? ""} onChange={(event) => moveImageToSlot(selected, event.target.value)} className={`${controlClasses} mt-1`}>
            <option value="">{t("freeLayer")}</option>
            {slots.map((slot) => <option key={slot.id} value={slot.id}>{locale === "zh" ? slot.nameZh : slot.nameEn}</option>)}
          </select>
        </label>
      )}
    </div>
  );

  const inspector = selected && composition ? <div className="flex flex-col gap-4"><div className="flex items-start justify-between gap-3"><div><p className="font-meta text-[0.6875rem] text-accent-text">{selected.type.toUpperCase()}</p><h2 className="font-display mt-1 text-xl font-semibold">{selected.name}</h2></div><Button size="compact" variant="danger" onClick={() => removeLayer(selected.id)}>{t("delete")}</Button></div>{selected.type === "text" && <><label className="text-sm font-semibold text-fg-muted">{t("content")}<textarea value={selected.text} onChange={(event) => updateLayer(selected.id, { text: event.target.value })} className={`${controlClasses} mt-1 min-h-24`} /></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-fg-muted">{t("fontSize")}<input type="number" min="10" max="500" value={Math.round(selected.fontSize)} onChange={(event) => updateLayer(selected.id, { fontSize: numberValue(event.target.value, selected.fontSize) })} className={`${controlClasses} mt-1`} /></label><label className="text-sm font-semibold text-fg-muted">{t("color")}<input type="color" value={selected.fill} onChange={(event) => updateLayer(selected.id, { fill: event.target.value })} className={`${controlClasses} mt-1 p-1`} /></label></div><label className="text-sm font-semibold text-fg-muted">{t("font")}<select value={selected.fontFamily} onChange={(event) => updateLayer(selected.id, { fontFamily: event.target.value })} className={`${controlClasses} mt-1`}>{FONT_OPTIONS.map((font) => <option key={font}>{font}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="text-sm font-semibold text-fg-muted">{t("alignment")}<select value={selected.align} onChange={(event) => updateLayer(selected.id, { align: event.target.value as CosplanTextLayer["align"] })} className={`${controlClasses} mt-1`}><option value="left">{t("alignLeft")}</option><option value="center">{t("alignCenter")}</option><option value="right">{t("alignRight")}</option></select></label><label className="flex min-h-11 items-center gap-2 self-end rounded-lg border border-border bg-control px-3 text-sm font-semibold"><input type="checkbox" checked={selected.bold} onChange={(event) => updateLayer(selected.id, { bold: event.target.checked })} />{t("bold")}</label></div></>}{selected.type === "image" && <div className="grid grid-cols-2 gap-3">{(["cropX", "cropY", "cropWidth", "cropHeight"] as const).map((field) => <label key={field} className="text-sm font-semibold text-fg-muted">{t(field)}<input type="number" min="0" max="100" value={Math.round(selected[field] * 100)} onChange={(event) => updateCrop(selected, field, event.target.value)} className={`${controlClasses} mt-1`} /></label>)}</div>}<div className="grid grid-cols-2 gap-3">{(["x", "y", "width", "rotation"] as const).map((field) => <label key={field} className="text-sm font-semibold capitalize text-fg-muted">{field}<input type="number" value={Math.round(selected[field])} onChange={(event) => updateLayer(selected.id, { [field]: numberValue(event.target.value, selected[field]) })} className={`${controlClasses} mt-1`} /></label>)}{selected.type === "image" && <label className="text-sm font-semibold capitalize text-fg-muted">height<input type="number" value={Math.round(selected.height)} onChange={(event) => updateLayer(selected.id, { height: numberValue(event.target.value, selected.height) })} className={`${controlClasses} mt-1`} /></label>}</div><div className="grid grid-cols-2 gap-2"><Button size="compact" onClick={() => duplicateLayer(selected)}>{t("duplicate")}</Button><Button size="compact" onClick={() => reorderLayer(selected.id, 1)}>{t("bringForward")}</Button><Button size="compact" onClick={() => reorderLayer(selected.id, -1)}>{t("sendBackward")}</Button>{selected.type === "image" && selected.sourceUrl && <a href={selected.sourceUrl} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "ghost", size: "compact" })}>{t("source")} ↗</a>}</div></div> : <p className="text-sm text-fg-subtle">{t("selectLayer")}</p>;

  const mobileTextTools = <div className="flex flex-col gap-6">{textTools}{selected?.type === "text" && <div className="border-t border-border pt-5">{inspector}</div>}</div>;

  const exportTools = <div className="flex flex-col gap-4"><h2 className="font-display text-xl font-semibold">{t("export")}</h2><p className="text-sm leading-6 text-fg-subtle">{composition ? t("exportHint", { width: composition.width, height: composition.height }) : t("chooseFirst")}</p><Button variant="primary" onClick={() => void exportPng()} disabled={!composition || exporting}>{exporting ? t("exporting") : t("downloadPng")}</Button>{exportFailed && <p role="alert" className="text-sm text-danger">{t("exportError")}</p>}<p role="status" className="text-xs text-fg-subtle">{draftStatus === "saved" ? t("draftSaved") : draftStatus === "error" ? t("draftError") : ""}</p></div>;

  const panelContent: Record<NonNullable<typeof mobilePanel>, ReactNode> = { background: backgroundTools, character: characterTools, text: mobileTextTools, layers: <div className="flex flex-col gap-6">{layerTools}<div className="border-t border-border pt-5">{inspector}</div></div>, export: exportTools };

  return <CanvasLayoutContext.Provider value={{ slots, foreground, width: composition?.width ?? 0, height: composition?.height ?? 0 }}><div className="relative pb-20 lg:pb-0">
    {draftAvailable && !composition && <div className="ui-panel-raised mb-5 flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-display text-xl font-semibold">{t("restoreTitle")}</h2><p className="mt-1 text-sm text-fg-subtle">{t("restoreHint", { title: draftAvailable.templateTitle })}</p></div><div className="flex gap-2"><Button onClick={() => void startNew()}>{t("startNew")}</Button><Button variant="primary" onClick={() => void restore()}>{t("restore")}</Button></div></div>}
    {!composition ? <section className="grid gap-5"><div><p className="font-meta text-[0.6875rem] tracking-[0.16em] text-accent-text">01 / {String(templates.length).padStart(2, "0")}</p><h2 className="font-display mt-2 text-2xl font-semibold">{t("chooseBackground")}</h2><p className="mt-1 text-sm text-fg-subtle">{t("chooseBackgroundHint")}</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{templates.map((template, index) => <button key={template.id} type="button" onClick={() => chooseTemplate(template)} className="group overflow-hidden rounded-xl border border-border bg-surface text-left transition hover:-translate-y-0.5 hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45"><span className="relative block aspect-[4/5] overflow-hidden bg-control"><img src={template.imageUrl} alt="" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" /><span className="font-meta absolute left-3 top-3 rounded-md bg-black/65 px-2 py-1 text-[0.6875rem] text-white">{String(index + 1).padStart(2, "0")}</span></span><span className="block p-4"><span className="font-display block text-lg font-semibold">{template.title}</span><span className="font-meta mt-1 block text-[0.6875rem] text-fg-subtle">{template.width} × {template.height} PX</span></span></button>)}</div></section> : <div className="grid min-w-0 gap-5 lg:grid-cols-[19rem_minmax(0,1fr)_19rem]"><aside className="ui-panel hidden self-start p-4 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-2rem)] lg:flex-col lg:gap-6 lg:overflow-y-auto">{backgroundTools}<div className="border-t border-border pt-5">{characterTools}</div><div className="border-t border-border pt-5">{textTools}</div></aside><section className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><p className="font-meta text-[0.6875rem] text-accent-text">{composition.templateTitle}</p><p className="text-xs text-fg-subtle">{composition.width} × {composition.height} PX</p></div><div className="flex items-center gap-2"><Button size="compact" onClick={undo} disabled={!past.length}>{t("undo")}</Button><Button size="compact" onClick={redo} disabled={!future.length}>{t("redo")}</Button><Button size="compact" onClick={() => void startNew()}>{t("startNew")}</Button></div></div><div ref={containerRef} role="region" aria-label={t("canvasLabel")} tabIndex={0} className="ui-panel flex min-h-[50dvh] min-w-0 items-start justify-center overflow-auto p-4"><Stage ref={stageRef} width={composition.width * displayScale} height={composition.height * displayScale} onMouseDown={(event) => { if (event.target === event.target.getStage() || event.target.name() === "background") setSelectedId(null); }} onTouchStart={(event) => { if (event.target === event.target.getStage() || event.target.name() === "background") setSelectedId(null); }}><Layer scaleX={displayScale} scaleY={displayScale}><Rect name="background" width={composition.width} height={composition.height} fill="#fff" /><KonvaImage name="background" image={background ?? undefined} width={composition.width} height={composition.height} />{composition.layers.map((layer) => layer.type === "image" ? <CanvasImage key={layer.id} layer={layer} selected={selectedId === layer.id} onSelect={() => setSelectedId(layer.id)} onChange={(patch) => updateLayer(layer.id, patch)} /> : <CanvasText key={layer.id} layer={layer} onSelect={() => setSelectedId(layer.id)} onChange={(patch) => updateLayer(layer.id, patch)} />)}<Transformer ref={transformerRef} rotateEnabled enabledAnchors={selected?.type === "text" ? ["middle-left", "middle-right", "top-left", "top-right", "bottom-left", "bottom-right"] : undefined} keepRatio={selected?.type === "image"} borderStroke="#a44f25" anchorStroke="#a44f25" anchorFill="#fff" anchorSize={Math.max(8, 12 / displayScale)} /></Layer></Stage></div><label className="mt-3 flex items-center gap-3 text-xs font-semibold text-fg-muted">{t("zoom")}<input type="range" min="0.5" max="2" step="0.1" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} className="min-w-0 flex-1 accent-[var(--color-accent)]" /><span className="font-meta w-12 text-right">{Math.round(zoom * 100)}%</span></label></section><aside className="ui-panel hidden self-start p-4 lg:sticky lg:top-4 lg:flex lg:max-h-[calc(100dvh-2rem)] lg:flex-col lg:gap-6 lg:overflow-y-auto">{layerTools}<div className="border-t border-border pt-5">{inspector}</div><div className="border-t border-border pt-5">{exportTools}</div></aside></div>}
    {composition && <nav aria-label={t("tools")} className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 z-30 grid w-[calc(100%-1rem)] max-w-xl -translate-x-1/2 grid-cols-5 rounded-xl border border-border-strong bg-raised/95 p-1 shadow-[0_16px_48px_rgb(0_0_0/0.24)] backdrop-blur-xl lg:hidden">{(["background", "character", "text", "layers", "export"] as const).map((panel) => <button key={panel} type="button" onClick={() => setMobilePanel(panel)} className="flex min-h-12 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[0.6875rem] font-semibold text-fg-muted hover:bg-accent-surface"><span aria-hidden="true" className="text-base">{panel === "background" ? "▧" : panel === "character" ? "+" : panel === "text" ? "T" : panel === "layers" ? "≡" : "↓"}</span><span className="truncate">{t(panel)}</span></button>)}</nav>}
    <Dialog open={mobilePanel !== null} onClose={() => setMobilePanel(null)} label={mobilePanel ? t(mobilePanel) : t("tools")} overlayClassName="items-end p-0 lg:hidden" panelClassName="max-h-[78dvh] max-w-2xl rounded-b-none p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"><div className="mb-4 flex justify-end"><Button variant="ghost" className="size-11 px-0" onClick={() => setMobilePanel(null)} aria-label={t("close")}><span aria-hidden="true">×</span></Button></div>{mobilePanel ? panelContent[mobilePanel] : null}</Dialog>
  </div></CanvasLayoutContext.Provider>;
}
