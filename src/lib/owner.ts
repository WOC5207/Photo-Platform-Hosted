import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { createBoundedCache } from "./boundedCache";

/**
 * Resolves which user's site a public request is for.
 *
 * Every owner-scoped page gets its owner from here and nowhere else. That is
 * the point: adding subdomains later (alice.pinhaoshe.ca) becomes a middleware
 * rewrite to /u/alice with no page changes, whereas pages resolving owners ad
 * hoc would make it a rewrite of everything.
 */

/**
 * The owner behind a /u/<username> segment, or null.
 *
 * Suspended accounts resolve to null, so suspending someone takes their public
 * site down immediately rather than only locking them out of their dashboard.
 */
export const findOwner = cache(async (username: string): Promise<User | null> => {
  const user = await prisma.user.findUnique({ where: { username } });
  return user && user.status === "active" ? user : null;
});

export type PublicOwner = Pick<User, "id" | "username" | "displayName" | "status">;

const publicOwnerCache = createBoundedCache<PublicOwner | null>({
  maxEntries: 5_000,
  ttlMs: 20_000
});

/** Public-only cross-request lookup. Internal and security-sensitive code uses
 * findOwner directly. Bounded in memory: the key is a URL segment anyone can
 * vary. */
export async function findPublicOwner(username: string): Promise<PublicOwner | null> {
  return publicOwnerCache(
    ["public-owner", username],
    ["public-content", `username:${username}`],
    async () => {
      const user = await prisma.user.findUnique({
        where: { username },
        select: { id: true, username: true, displayName: true, status: true }
      });
      return user && user.status === "active" ? user : null;
    }
  );
}

/** The owner, or a 404 — for pages whose entire content is theirs. */
export const resolveOwner = cache(async (username: string): Promise<User> => {
  const owner = await findOwner(username);
  if (!owner) notFound();
  return owner;
});

/** Display name for the directory and chrome; never blank. */
export function ownerName(owner: Pick<User, "displayName" | "username">): string {
  return owner.displayName || owner.username;
}

/**
 * Root of one owner's public site. Locale is added separately by the i18n
 * Link/redirect helpers, so this must NOT include it.
 */
export function ownerBasePath(username: string): string {
  return `/u/${username}`;
}
