import "server-only";
import { createHash } from "node:crypto";
import { rateLimit } from "@/lib/rate-limit";

/**
 * A recipient-scoped bucket prevents an attacker from bypassing the IP or
 * identity gate with proxy churn to repeatedly mail the same person. Only a
 * one-way digest is kept in memory; no contact information becomes a limiter
 * key. Shared by the web and mini-program booking paths so both mail the same
 * person at the same rate.
 */
export function bookingRecipientAllowed(
  eventId: string,
  recipient: { email: string; contactValue: string }
): boolean {
  const recipientIdentity = (recipient.email || recipient.contactValue)
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
  const recipientDigest = createHash("sha256")
    .update(recipientIdentity)
    .digest("hex");
  return rateLimit(`book-recipient:${eventId}:${recipientDigest}`, {
    limit: 5,
    windowMs: 60 * 60 * 1000
  });
}
