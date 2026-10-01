import "server-only";

import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { processAndStoreSiteImage, siteDir } from "@/lib/images";
import { discardSiteImage } from "@/lib/siteImages";
import { SHARING_POSTER_LAYER_TOKEN } from "@/lib/sharingPoster";

/**
 * Images owners upload as poster layers. They are site images (counted
 * against the owner's quota, stored under their `_site` folder) with their own
 * purpose, which the public site-image route does not serve: only the owner
 * reads them, through the dashboard layer route.
 */
export const SHARING_POSTER_LAYER_PURPOSE = "posterlayer";
const LAYER_IMAGE_OPTIONS = {
  prefix: SHARING_POSTER_LAYER_PURPOSE,
  maxWidth: 4096,
  maxHeight: 4096,
  quality: 92
};
/** An upload no poster has used for this long is taken as abandoned. */
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export function sharingPosterLayerPath(ownerId: string, token: string): string | null {
  if (!SHARING_POSTER_LAYER_TOKEN.test(token)) return null;
  return path.join(siteDir(ownerId), `${token}.webp`);
}

/** Store an uploaded layer as webp, keeping its transparency. */
export async function storeSharingPosterLayer(
  ownerId: string,
  input: string
): Promise<{ token: string; bytes: number; width: number; height: number }> {
  const stored = await processAndStoreSiteImage(ownerId, input, LAYER_IMAGE_OPTIONS);
  const filePath = path.join(siteDir(ownerId), `${stored.token}.webp`);
  const meta = await sharp(filePath).metadata();
  if (!meta.width || !meta.height) throw new Error("Unreadable image");
  return { ...stored, width: meta.width, height: meta.height };
}

function layerTokens(composition: unknown): string[] {
  const layers = (composition as { layers?: unknown } | null)?.layers;
  if (!Array.isArray(layers)) return [];
  return layers
    .map((layer) => (layer as { token?: unknown } | null)?.token)
    .filter((token): token is string => typeof token === "string");
}

/** The layer tokens a stored composition refers to, without a full parse. */
export function sharingPosterLayerTokens(composition: unknown): string[] {
  return layerTokens(composition);
}

/**
 * Discard the owner's layer images that none of their posters uses: those in
 * `candidates` (just dropped from a poster, or from a deleted one) and any
 * left unused since upload for a day. A layer shared by a duplicated poster
 * stays while any poster still shows it. Best-effort, like discardSiteImage.
 */
export async function discardUnusedSharingPosterLayers(
  ownerId: string,
  candidates: string[] = []
): Promise<void> {
  const rows = await prisma.siteImage.findMany({
    where: {
      ownerId,
      purpose: SHARING_POSTER_LAYER_PURPOSE,
      OR: [
        { token: { in: candidates } },
        { createdAt: { lt: new Date(Date.now() - ABANDONED_AFTER_MS) } }
      ]
    },
    select: { token: true }
  });
  if (rows.length === 0) return;
  const posters = await prisma.sharingPoster.findMany({
    where: { ownerId },
    select: { composition: true }
  });
  const used = new Set(posters.flatMap((poster) => layerTokens(poster.composition)));
  for (const { token } of rows) {
    if (!used.has(token)) await discardSiteImage(ownerId, token).catch(() => {});
  }
}
