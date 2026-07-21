import "server-only";
import { formatSlotRange } from "./datetime";
import { sendMail, type MailMessage, type MailTransport } from "./mailer";

/**
 * Email notifications for booking status and admin announcements.
 *
 * Everything here is fire-and-forget: callers do not await delivery and a
 * failed send never surfaces (see sendMail, which cannot throw). The actual
 * transport and the "is mail even configured?" gate live in src/lib/mailer.ts —
 * with SMTP_* unset every function below is a silent no-op.
 *
 * Bodies are BILINGUAL (English then 中文, stacked). Recipient locale is not
 * known at send time — a visitor cancelling has no session locale, an account's
 * language is not stored — so both languages always go out, matching the
 * *En/*Zh shape the rest of the data model uses.
 */

export interface BookingNotification {
  bookingId: string;
  name: string;
  subject: string;
  contactMethod: string;
  contactValue: string;
  eventTitle: string;
  slotStart: Date;
  slotEnd: Date;
  manageUrl: string; // visitor's cancel/view link
  // Recipient addresses. Empty string means "no address" for that party, in
  // which case they simply are not emailed.
  visitorEmail: string;
  ownerEmail: string;
}

/**
 * Who, if anyone, gets emailed about a booking: the visitor when they left an
 * address, the owner when their account has one. Pure and separate from the
 * sending so the selection rule can be asserted directly (scripts/test-email.ts)
 * — the correctness of "email the right people" does not depend on a live SMTP
 * server to test.
 */
export function resolveBookingRecipients(info: {
  visitorEmail: string;
  ownerEmail: string;
}): string[] {
  const out: string[] = [];
  if (info.visitorEmail.trim()) out.push(info.visitorEmail.trim());
  if (info.ownerEmail.trim()) out.push(info.ownerEmail.trim());
  return out;
}

// ── bilingual text helpers ────────────────────────────────────────────────

const LANG_SEP = "\n\n———\n\n";

/** Join English and 中文 parts, dropping either if it is empty. */
function bilingual(en: string, zh: string, separator: string = LANG_SEP): string {
  return [en.trim(), zh.trim()].filter(Boolean).join(separator);
}

// ── booking messages (per audience) ───────────────────────────────────────

function visitorConfirmedMessage(info: BookingNotification): MailMessage {
  const slot = formatSlotRange(info.slotStart, info.slotEnd);
  return {
    to: info.visitorEmail,
    subject: "Booking confirmed · 预约已确认",
    text: bilingual(
      `Hi ${info.name},\n\nYour booking is confirmed.\n\n` +
        `Event: ${info.eventTitle}\nTime: ${slot}\n\n` +
        `Manage or cancel your booking:\n${info.manageUrl}`,
      `${info.name} 您好，\n\n您的预约已确认。\n\n` +
        `活动：${info.eventTitle}\n时间：${slot}\n\n` +
        `管理或取消预约：\n${info.manageUrl}`
    )
  };
}

function visitorCancelledMessage(info: BookingNotification): MailMessage {
  const slot = formatSlotRange(info.slotStart, info.slotEnd);
  return {
    to: info.visitorEmail,
    subject: "Booking cancelled · 预约已取消",
    text: bilingual(
      `Hi ${info.name},\n\nYour booking has been cancelled.\n\n` +
        `Event: ${info.eventTitle}\nTime: ${slot}`,
      `${info.name} 您好，\n\n您的预约已取消。\n\n` +
        `活动：${info.eventTitle}\n时间：${slot}`
    )
  };
}

function ownerBookingLine(info: BookingNotification): { en: string; zh: string } {
  const slot = formatSlotRange(info.slotStart, info.slotEnd);
  const subjectEn = info.subject ? `\nSubject: ${info.subject}` : "";
  const subjectZh = info.subject ? `\n主题：${info.subject}` : "";
  const contact = `${info.contactMethod}: ${info.contactValue}`;
  return {
    en:
      `Event: ${info.eventTitle}\nTime: ${slot}\n` +
      `Name: ${info.name}${subjectEn}\nContact: ${contact}`,
    zh:
      `活动：${info.eventTitle}\n时间：${slot}\n` +
      `姓名：${info.name}${subjectZh}\n联系方式：${contact}`
  };
}

function ownerCreatedMessage(info: BookingNotification): MailMessage {
  const d = ownerBookingLine(info);
  return {
    to: info.ownerEmail,
    subject: "New booking received · 收到新预约",
    text: bilingual(
      `A new booking has been made.\n\n${d.en}`,
      `收到一条新预约。\n\n${d.zh}`
    )
  };
}

function ownerCancelledMessage(info: BookingNotification): MailMessage {
  const d = ownerBookingLine(info);
  return {
    to: info.ownerEmail,
    subject: "Booking cancelled · 预约已取消",
    text: bilingual(
      `A booking has been cancelled.\n\n${d.en}`,
      `一条预约已被取消。\n\n${d.zh}`
    )
  };
}

// ── booking notifiers ─────────────────────────────────────────────────────

/** New booking: confirm to the visitor, alert the owner. */
export async function notifyBookingCreated(
  info: BookingNotification,
  transport?: MailTransport
): Promise<void> {
  const sends: Promise<unknown>[] = [];
  if (info.visitorEmail.trim())
    sends.push(sendMail(visitorConfirmedMessage(info), transport));
  if (info.ownerEmail.trim())
    sends.push(sendMail(ownerCreatedMessage(info), transport));
  await Promise.allSettled(sends);
}

/** Booking cancelled (visitor self-cancel): notify both parties. */
export async function notifyBookingCancelled(
  info: BookingNotification,
  transport?: MailTransport
): Promise<void> {
  const sends: Promise<unknown>[] = [];
  if (info.visitorEmail.trim())
    sends.push(sendMail(visitorCancelledMessage(info), transport));
  if (info.ownerEmail.trim())
    sends.push(sendMail(ownerCancelledMessage(info), transport));
  await Promise.allSettled(sends);
}

/**
 * Photographer changed a booking's status from the dashboard. Only the visitor
 * is emailed — the owner made the change themselves, so a mail back to them is
 * noise. `status` picks the confirmed vs cancelled wording.
 */
export async function notifyBookingStatusChanged(
  info: BookingNotification,
  status: "confirmed" | "cancelled",
  transport?: MailTransport
): Promise<void> {
  if (!info.visitorEmail.trim()) return;
  const message =
    status === "confirmed"
      ? visitorConfirmedMessage(info)
      : visitorCancelledMessage(info);
  await sendMail(message, transport);
}

// ── admin announcement ────────────────────────────────────────────────────

export interface AnnouncementNotification {
  titleEn: string;
  titleZh: string;
  bodyEn: string;
  bodyZh: string;
  // Account emails to reach. Empty strings are ignored, so callers may pass the
  // raw column without filtering.
  recipients: string[];
}

/** Email an admin announcement to every account that has an address. */
export async function notifyAnnouncement(
  info: AnnouncementNotification,
  transport?: MailTransport
): Promise<void> {
  const subject =
    bilingual(info.titleEn, info.titleZh, " · ") || "Announcement · 通知";
  const text = bilingual(
    [info.titleEn.trim(), info.bodyEn.trim()].filter(Boolean).join("\n\n"),
    [info.titleZh.trim(), info.bodyZh.trim()].filter(Boolean).join("\n\n")
  );

  const targets = info.recipients.map((r) => r.trim()).filter(Boolean);
  await Promise.allSettled(
    targets.map((to) => sendMail({ to, subject, text }, transport))
  );
}
