import { parseCosplanSlots, type CosplanComposition, type CosplanImageLayer, type CosplanSlot, type CosplanTemplateSummary } from "./cosplanTypes";

/**
 * The Cosplan draft kept in the visitor's browser, and the placement rules
 * shared by the classic editor (/cosplan) and the 3D site (/3d/cosplan).
 * Both read and write the same IndexedDB record, so a draft started on one
 * carries on in the other.
 */

const DB_NAME = "photo-platform-cosplan";
const STORE_NAME = "drafts";
const DRAFT_KEY = "current";
export const COSPLAN_IMAGE_LIMIT = 20;
export const COSPLAN_TEXT_LIMIT = 30;

export function supportedDraft(value: unknown): value is CosplanComposition {
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
    draft.layers.length > COSPLAN_IMAGE_LIMIT + COSPLAN_TEXT_LIMIT
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
    return layer.type === "image" && (layer.showName === undefined || typeof layer.showName === "boolean") && Number.isFinite(layer.height) && [layer.cropX, layer.cropY, layer.cropWidth, layer.cropHeight].every(Number.isFinite);
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

/** The saved draft as stored: uploaded images are blobs with an empty `src`. */
export async function readDraft(): Promise<CosplanComposition | null> {
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(DRAFT_KEY);
    request.onsuccess = () => resolve(supportedDraft(request.result) ? request.result : null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
  });
}

/** Saves a draft; blob-backed images drop their object URLs, which die with the page. */
export async function writeDraft(draft: CosplanComposition): Promise<void> {
  const stored = structuredClone(draft);
  for (const layer of stored.layers) if (layer.type === "image" && layer.blob) layer.src = "";
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(stored, DRAFT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

export async function clearDraft(): Promise<void> {
  const db = await openDraftDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(DRAFT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

/** A stored draft made usable: blob-backed images get fresh object URLs. */
export function restoreDraft(stored: CosplanComposition): CosplanComposition {
  const restored = structuredClone(stored);
  for (const layer of restored.layers) if (layer.type === "image" && layer.blob) layer.src = URL.createObjectURL(layer.blob);
  return restored;
}

/** Revokes the object URLs restoreDraft made. */
export function releaseDraft(draft: CosplanComposition) {
  for (const layer of draft.layers) if (layer.type === "image" && layer.blob && layer.src.startsWith("blob:")) URL.revokeObjectURL(layer.src);
}

export type CosplanCharacter = {
  src: string;
  blob?: Blob;
  sourceUrl?: string;
  name: string;
  naturalWidth: number;
  naturalHeight: number;
};

/** A new character layer: fitted to 90% of its slot and centred, or free on the poster. */
export function placeCharacter(composition: CosplanComposition, character: CosplanCharacter, slot?: CosplanSlot): CosplanImageLayer {
  const maxWidth = slot ? slot.width * 0.9 : composition.width * 0.55;
  const maxHeight = slot ? slot.height * 0.9 : composition.height * 0.65;
  const ratio = Math.min(maxWidth / character.naturalWidth, maxHeight / character.naturalHeight, 1);
  const width = character.naturalWidth * ratio;
  const height = character.naturalHeight * ratio;
  return {
    id: crypto.randomUUID(),
    type: "image",
    name: character.name,
    showName: true,
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
}

/** The draft moved onto another background, its layers rescaled and slots matched by id. */
export function composeOnTemplate(template: CosplanTemplateSummary, composition: CosplanComposition | null): CosplanComposition {
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
  return {
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
  };
}
