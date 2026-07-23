import "server-only";
import nodemailer from "nodemailer";
import { config } from "./config";

/**
 * The one place email actually leaves the process. Everything above this
 * (src/lib/notify.ts) decides *what* to send and to whom; this decides *whether*
 * it can be sent at all and does the sending.
 *
 * Two invariants the callers rely on:
 *  - It never throws. A dead SMTP server or a malformed address must not take
 *    down the booking or announcement that triggered the email — those succeed
 *    with or without mail. Failures come back as a result object instead.
 *  - When SMTP is not configured it is a deliberate no-op (`skipped`), so a
 *    deploy that never sets SMTP_* behaves exactly as it did before email
 *    existed.
 */

export interface MailMessage {
  to: string;
  subject: string;
  // Plain-text body. Always set — it is the fallback for clients that don't
  // render HTML, and the only body when `html` is absent.
  text: string;
  // Optional HTML body. When present it is delivered alongside `text` as a
  // multipart/alternative message, and rich clients show this instead.
  html?: string;
}

/**
 * The slice of a nodemailer transport we depend on. Declared as its own
 * interface so tests can inject a fake that records messages, without a real
 * SMTP server and without importing nodemailer.
 */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

export type SendMailResult =
  | { sent: true }
  // Not configured — nothing was attempted. Distinct from a failure so a
  // no-mail deploy and a broken mail server are never confused.
  | { sent: false; skipped: true }
  | { sent: false; error: string };

// Built once and reused: nodemailer pools connections per transport, and
// rebuilding one per email would throw that away.
let cached: MailTransport | null = null;

function transport(): MailTransport {
  if (cached) return cached;
  const s = config.smtp();
  cached = nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    // Omit auth entirely for an unauthenticated relay (e.g. a LAN mail host);
    // passing empty credentials would make nodemailer attempt a broken AUTH.
    auth: s.user ? { user: s.user, pass: s.pass } : undefined
  });
  return cached;
}

/**
 * Send one message. Pass `injected` to route through a specific transport
 * (tests); otherwise the shared SMTP transport is used. Returns `skipped` when
 * mail is not configured and no transport was injected.
 */
export async function sendMail(
  message: MailMessage,
  injected?: MailTransport
): Promise<SendMailResult> {
  if (!injected && !config.isMailConfigured()) {
    return { sent: false, skipped: true };
  }
  if (!message.to.trim()) return { sent: false, skipped: true };

  const t = injected ?? transport();
  try {
    await t.sendMail({
      from: config.smtp().from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      // Only set html when there is one, so text-only messages stay a plain
      // single-part email rather than an empty-HTML multipart.
      ...(message.html ? { html: message.html } : {})
    });
    return { sent: true };
  } catch (error) {
    return {
      sent: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}
