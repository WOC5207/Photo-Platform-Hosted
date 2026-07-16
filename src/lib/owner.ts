import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "./db";

/**
 * Resolves which user's site a public request is for.
 *
 * SCAFFOLDING. Right now the public routes are still un-prefixed (/gallery,
 * /booking, ...) with nowhere to name an owner, so they all resolve to the
 * platform admin — the deployment behaves exactly like the single-photographer
 * site it grew out of, while the data underneath is fully owner-scoped.
 *
 * The routing phase replaces this with resolution from the /u/<username> path
 * segment. Everything owner-scoped already reads its owner from this module, so
 * that change lands here rather than in twenty pages — and layering subdomains
 * on later stays a middleware rewrite instead of a rewrite of everything.
 */
export const findSiteOwner = cache(async (): Promise<User | null> => {
  return prisma.user.findFirst({
    where: { role: "admin", status: "active" },
    orderBy: { createdAt: "asc" }
  });
});

/**
 * The owner, or a 404 — for pages whose entire content belongs to them.
 *
 * Do NOT use this in anything that wraps the login page. The admin account is
 * seeded by the first successful login, so on a fresh deployment there is no
 * owner yet; a 404 in shared chrome would take the login page down with
 * everything else, leaving no way to ever seed the admin and no way in. Use
 * findSiteOwner() and fall back to defaults there instead.
 */
export const getSiteOwner = cache(async (): Promise<User> => {
  const owner = await findSiteOwner();
  if (!owner) notFound();
  return owner;
});
