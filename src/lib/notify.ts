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
 * Language:
 *  - VISITOR emails (confirmation, cancellation) go out in the *one* language
 *    the visitor booked in — carried on `BookingNotification.locale`, which is
 *    persisted on the booking (Booking.locale) precisely so a status change made
 *    later from the photographer's dashboard still reaches them in their own
 *    language. They also carry a styled HTML body mirroring the on-site booking
 *    card, with a plain-text fallback.
 *  - OWNER alerts and admin ANNOUNCEMENTS stay BILINGUAL (English then 中文): the
 *    photographer/admin has no single "booking locale" and sees visitors from
 *    both sites, so both languages go out, matching the *En/*Zh data model.
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
  timeZone?: string;
  pricePerPerson?: string;
  manageUrl: string; // visitor's cancel/view link
  // The owner's dashboard link for this booking's event — the "View in
  // dashboard" button on their alert. Optional: when absent the owner card
  // simply renders without a button. Never used for the visitor email.
  dashboardUrl?: string;
  // Site language the visitor booked in ("zh" | "en"); picks the single language
  // their confirmation/cancellation email is written in. Anything other than
  // "en" falls back to Chinese, the platform default.
  locale: string;
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

// ── bilingual text helpers (owner alerts + announcements) ──────────────────

const LANG_SEP = "\n\n———\n\n";

/** Join English and 中文 parts, dropping either if it is empty. */
function bilingual(en: string, zh: string, separator: string = LANG_SEP): string {
  return [en.trim(), zh.trim()].filter(Boolean).join(separator);
}

// ── visitor emails: single language + styled HTML ──────────────────────────

type Lang = "en" | "zh";

/** The visitor's site language, folding anything non-English to the default. */
function langOf(locale: string): Lang {
  return locale === "en" ? "en" : "zh";
}

// Shared row/status vocabulary, kept here rather than in messages/*.json so this
// module stays hermetic — its tests run without the next-intl runtime.
const STRINGS: Record<Lang, Record<string, string>> = {
  en: {
    event: "Event",
    time: "Time",
    name: "Name",
    subject: "Subject",
    status: "Status",
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    manage: "Manage or cancel your booking",
    view: "View booking"
  },
  zh: {
    event: "活动",
    time: "时间",
    name: "姓名",
    subject: "主题",
    status: "状态",
    confirmed: "已确认",
    cancelled: "已取消",
    manage: "管理或取消预约",
    view: "查看预约"
  }
};

// Per-kind heading / subject line / greeting, keyed by language.
const VISITOR_KIND: Record<
  "confirmed" | "cancelled" | "updated",
  Record<Lang, { subject: string; heading: string; intro: (name: string) => string }>
> = {
  confirmed: {
    en: {
      subject: "Booking confirmed",
      heading: "Booking confirmed",
      intro: (n) => `Hi ${n}, your booking is confirmed.`
    },
    zh: {
      subject: "预约已确认",
      heading: "预约已确认",
      intro: (n) => `${n} 您好，您的预约已确认。`
    }
  },
  cancelled: {
    en: {
      subject: "Booking cancelled",
      heading: "Booking cancelled",
      intro: (n) => `Hi ${n}, your booking has been cancelled.`
    },
    zh: {
      subject: "预约已取消",
      heading: "预约已取消",
      intro: (n) => `${n} 您好，您的预约已取消。`
    }
  },
  updated: {
    en: {
      subject: "Booking updated",
      heading: "Booking updated",
      intro: (n) => `Hi ${n}, your booking changes are saved.`
    },
    zh: {
      subject: "预约已更新",
      heading: "预约已更新",
      intro: (n) => `${n} 您好，您的预约修改已保存。`
    }
  }
};

const STATUS_CONFIRMED_COLOR = "#15803d";
const STATUS_CANCELLED_COLOR = "#b91c1c";

/**
 * Escape a user-supplied value before it goes into HTML. Name, subject and
 * event title are visitor/photographer text, so they must never be able to
 * inject markup into the email body.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface EmailRow {
  label: string;
  value: string;
  color?: string;
}

/**
 * A self-contained, inline-styled HTML body mirroring the on-site booking card:
 * a heading, a bordered detail table, and a button back to the manage link.
 * Table/inline-style layout and no external assets — the shape email clients
 * actually render.
 */
function bookingEmailHtml(view: {
  heading: string;
  intro: string;
  rows: EmailRow[];
  // The call-to-action button + the small note/raw-link beneath it. Optional so
  // a card can stand without one (e.g. a link-less variant).
  action?: { buttonLabel: string; noteLabel: string; url: string };
}): string {
  const rowsHtml = view.rows
    .map((r, i) => {
      const divider = i === 0 ? "" : "border-top:1px solid #f0efed;";
      return (
        `<tr>` +
        `<td style="width:34%;padding:11px 16px;font-size:13px;color:#78716c;white-space:nowrap;vertical-align:top;${divider}">${escapeHtml(
          r.label
        )}</td>` +
        `<td style="padding:11px 16px;font-size:14px;font-weight:600;word-break:break-word;overflow-wrap:anywhere;color:${
          r.color ?? "#1c1917"
        };text-align:right;${divider}">${escapeHtml(r.value)}</td>` +
        `</tr>`
      );
    })
    .join("");

  return (
    `<div style="margin:0;padding:24px 12px;background:#f5f5f4;">` +
    `<div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">` +
    `<div style="background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;overflow:hidden;">` +
    `<div style="padding:24px 28px 4px;">` +
    `<h1 style="margin:0;font-size:20px;font-weight:700;color:#1c1917;">${escapeHtml(
      view.heading
    )}</h1>` +
    `<p style="margin:8px 0 16px;font-size:14px;line-height:1.5;color:#57534e;">${escapeHtml(
      view.intro
    )}</p>` +
    `</div>` +
    `<div style="padding:0 28px ${view.action ? "20px" : "28px"};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border:1px solid #e7e5e4;border-radius:12px;border-collapse:separate;overflow:hidden;">${rowsHtml}</table>` +
    `</div>` +
    (view.action ? actionHtml(view.action) : "") +
    `</div></div></div>`
  );
}

/** The button + note + raw-link footer of a booking card. */
function actionHtml(action: {
  buttonLabel: string;
  noteLabel: string;
  url: string;
}): string {
  const url = escapeHtml(action.url);
  return (
    `<div style="padding:0 28px 28px;">` +
    `<a href="${url}" style="display:inline-block;background:#1c1917;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:10px;font-size:14px;font-weight:600;">${escapeHtml(
      action.buttonLabel
    )}</a>` +
    `<p style="margin:14px 0 0;font-size:12px;color:#57534e;">${escapeHtml(
      action.noteLabel
    )}</p>` +
    `<p style="margin:4px 0 0;font-size:12px;word-break:break-all;"><a href="${url}" style="color:#a8a29e;">${url}</a></p>` +
    `</div>`
  );
}

/** Build a visitor booking email in the language used for the reservation. */
function visitorMessage(
  info: BookingNotification,
  kind: "confirmed" | "cancelled" | "updated"
): MailMessage {
  const lang = langOf(info.locale);
  const s = STRINGS[lang];
  const k = VISITOR_KIND[kind][lang];
  const slot = bookingSlotLabel(info);
  const statusText = kind === "cancelled" ? s.cancelled : s.confirmed;
  const statusColor =
    kind === "cancelled" ? STATUS_CANCELLED_COLOR : STATUS_CONFIRMED_COLOR;

  const rows: EmailRow[] = [
    { label: s.event, value: info.eventTitle },
    { label: s.time, value: slot }
  ];
  if (info.pricePerPerson) {
    rows.push({
      label: lang === "en" ? "Price per person" : "每人价格",
      value: info.pricePerPerson
    });
  }
  rows.push({ label: s.name, value: info.name });
  if (info.subject) rows.push({ label: s.subject, value: info.subject });
  rows.push({ label: s.status, value: statusText, color: statusColor });

  const text =
    `${k.intro(info.name)}\n\n` +
    rows.map((r) => `${r.label}: ${r.value}`).join("\n") +
    `\n\n${s.manage}:\n${info.manageUrl}`;

  const html = bookingEmailHtml({
    heading: k.heading,
    intro: k.intro(info.name),
    rows,
    action: { buttonLabel: s.view, noteLabel: s.manage, url: info.manageUrl }
  });

  return { to: info.visitorEmail, subject: k.subject, text, html };
}

function visitorConfirmedMessage(info: BookingNotification): MailMessage {
  return visitorMessage(info, "confirmed");
}

function visitorCancelledMessage(info: BookingNotification): MailMessage {
  return visitorMessage(info, "cancelled");
}

function visitorUpdatedMessage(info: BookingNotification): MailMessage {
  return visitorMessage(info, "updated");
}

/**
 * Contact display: "Method: value" for older bookings that captured a method
 * label, or just the value for current bookings (the method dropdown was
 * removed, so contactMethod is empty and a bare value avoids a leading ": ").
 */
function formatContact(info: BookingNotification): string {
  return info.contactMethod
    ? `${info.contactMethod}: ${info.contactValue}`
    : info.contactValue;
}

function ownerBookingLine(info: BookingNotification): { en: string; zh: string } {
  const slot = bookingSlotLabel(info);
  const subjectEn = info.subject ? `\nSubject: ${info.subject}` : "";
  const priceEn = info.pricePerPerson
    ? `\nPrice per person: ${info.pricePerPerson}`
    : "";
  const priceZh = info.pricePerPerson
    ? `\n每人价格：${info.pricePerPerson}`
    : "";
  const subjectZh = info.subject ? `\n主题：${info.subject}` : "";
  const contact = formatContact(info);
  return {
    en:
      `Event: ${info.eventTitle}\nTime: ${slot}${priceEn}\n` +
      `Name: ${info.name}${subjectEn}\nContact: ${contact}`,
    zh:
      `活动：${info.eventTitle}\n时间：${slot}${priceZh}\n` +
      `姓名：${info.name}${subjectZh}\n联系方式：${contact}`
  };
}

// Owner cards are bilingual — the photographer sees visitors from both sites and
// has no single locale — so every label pairs the two languages (`EN · 中文`).
const OWNER_LABELS = {
  event: "Event · 活动",
  time: "Time · 时间",
  name: "Name · 姓名",
  subject: "Subject · 主题",
  contact: "Contact · 联系方式",
  status: "Status · 状态"
};

/** Rows shared by both owner alerts, plus the trailing bilingual status row. */
function ownerRows(info: BookingNotification, statusText: string, statusColor: string): EmailRow[] {
  const slot = bookingSlotLabel(info);
  const rows: EmailRow[] = [
    { label: OWNER_LABELS.event, value: info.eventTitle },
    { label: OWNER_LABELS.time, value: slot }
  ];
  if (info.pricePerPerson) {
    rows.push({
      label: "Price per person · 每人价格",
      value: info.pricePerPerson
    });
  }
  rows.push({ label: OWNER_LABELS.name, value: info.name });
  if (info.subject) rows.push({ label: OWNER_LABELS.subject, value: info.subject });
  rows.push({
    label: OWNER_LABELS.contact,
    value: formatContact(info)
  });
  rows.push({ label: OWNER_LABELS.status, value: statusText, color: statusColor });
  return rows;
}

function bookingSlotLabel(info: BookingNotification): string {
  const slot = formatSlotRange(info.slotStart, info.slotEnd);
  return info.timeZone ? `${slot} (${info.timeZone})` : slot;
}

/** A "View in dashboard" action for the owner card, when a dashboard link exists. */
function ownerAction(info: BookingNotification) {
  return info.dashboardUrl
    ? {
        buttonLabel: "View in dashboard · 在后台查看",
        noteLabel: "Manage this booking · 管理此预约",
        url: info.dashboardUrl
      }
    : undefined;
}

function ownerCreatedMessage(info: BookingNotification): MailMessage {
  const d = ownerBookingLine(info);
  const heading = "New booking · 收到新预约";
  const intro = "A new booking has been made. · 收到一条新预约。";
  return {
    to: info.ownerEmail,
    subject: "New booking received · 收到新预约",
    text: bilingual(
      `A new booking has been made.\n\n${d.en}`,
      `收到一条新预约。\n\n${d.zh}`
    ),
    html: bookingEmailHtml({
      heading,
      intro,
      rows: ownerRows(info, "Confirmed · 已确认", STATUS_CONFIRMED_COLOR),
      action: ownerAction(info)
    })
  };
}

function ownerCancelledMessage(info: BookingNotification): MailMessage {
  const d = ownerBookingLine(info);
  const heading = "Booking cancelled · 预约已取消";
  const intro = "A booking has been cancelled. · 一条预约已被取消。";
  return {
    to: info.ownerEmail,
    subject: "Booking cancelled · 预约已取消",
    text: bilingual(
      `A booking has been cancelled.\n\n${d.en}`,
      `一条预约已被取消。\n\n${d.zh}`
    ),
    html: bookingEmailHtml({
      heading,
      intro,
      rows: ownerRows(info, "Cancelled · 已取消", STATUS_CANCELLED_COLOR),
      action: ownerAction(info)
    })
  };
}

function ownerUpdatedMessage(info: BookingNotification): MailMessage {
  const d = ownerBookingLine(info);
  const heading = "Booking updated · 预约已更新";
  const intro = "A visitor updated their booking. · 访客修改了一条预约。";
  return {
    to: info.ownerEmail,
    subject: "Booking updated · 预约已更新",
    text: bilingual(
      `A visitor updated their booking.\n\n${d.en}`,
      `访客修改了一条预约。\n\n${d.zh}`
    ),
    html: bookingEmailHtml({
      heading,
      intro,
      rows: ownerRows(info, "Confirmed · 已确认", STATUS_CONFIRMED_COLOR),
      action: ownerAction(info)
    })
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

/** Visitor self-edit: confirm the new details and alert the photographer. */
export async function notifyBookingUpdated(
  info: BookingNotification,
  transport?: MailTransport
): Promise<void> {
  const sends: Promise<unknown>[] = [];
  if (info.visitorEmail.trim())
    sends.push(sendMail(visitorUpdatedMessage(info), transport));
  if (info.ownerEmail.trim())
    sends.push(sendMail(ownerUpdatedMessage(info), transport));
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
