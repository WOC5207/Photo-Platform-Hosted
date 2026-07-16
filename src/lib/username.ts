/**
 * Username rules.
 *
 * Pure validation, deliberately free of any server or Next import: a username
 * is the public identity of a site (/u/<username>), so these rules are needed
 * by server actions, and by tests that run outside the framework.
 */

/** Reserved for the platform itself; never claimable as a username. */
const RESERVED_USERNAMES = new Set([
  // Real path segments today.
  "u",
  "admin",
  "api",
  "login",
  "logout",
  "register",
  "dashboard",
  "zh",
  "en",
  "_next",
  // The site-images directory, which lives beside per-user storage.
  "_site",
  // Not collidable while usernames are a /u/ path segment — but they are under
  // subdomains, which the routing is designed to allow later. Reserving them
  // now costs nothing; reclaiming one from a real account later is a migration
  // and an apology.
  "www",
  "mail",
  "static",
  "assets",
  "cdn",
  "help",
  "support",
  "about",
  "status"
]);

/** Lowercase, 2–31 chars, starts alphanumeric. Hyphens allowed inside. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}$/;

export function usernameError(username: string): "invalid" | "reserved" | null {
  if (!USERNAME_PATTERN.test(username)) return "invalid";
  if (RESERVED_USERNAMES.has(username)) return "reserved";
  return null;
}
