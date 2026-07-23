/**
 * Email notification tests.
 *
 * Two things have to be true for this feature to be safe:
 *  - It is genuinely off when SMTP is not configured (a no-mail deploy must
 *    behave exactly as before), and genuinely on when it is.
 *  - The right people are chosen: a visitor only when they left an address, the
 *    owner only when their account has one.
 *
 * Neither needs a real SMTP server or a database — the transport is injected and
 * the recipient rule is a pure function — so this suite is fast and hermetic.
 * It controls SMTP_* entirely through process.env, which is why the npm script
 * does NOT load .env (a developer's real SMTP settings would otherwise flip the
 * "unconfigured" case).
 *
 *   npm run test:email
 */
import { config } from "../src/lib/config";
import { sendMail, type MailTransport } from "../src/lib/mailer";
import {
  resolveBookingRecipients,
  notifyAnnouncement,
  notifyBookingCreated,
  notifyBookingStatusChanged,
  type BookingNotification
} from "../src/lib/notify";

let failures = 0;

function report(name: string, ok: boolean, detail: string) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}\n      ${detail}`);
  if (!ok) failures++;
}

interface SentMessage {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** A transport that records what it was asked to send instead of sending it. */
function fakeTransport(): { sent: SentMessage[]; transport: MailTransport } {
  const sent: SentMessage[] = [];
  return {
    sent,
    transport: {
      async sendMail(message: SentMessage) {
        sent.push(message);
        return { messageId: "fake" };
      }
    }
  };
}

/** Set SMTP_* so config.isMailConfigured() is true; returns a reset fn. */
function withSmtpConfigured(from = "Platform <no-reply@test>"): () => void {
  const prev = {
    host: process.env.SMTP_HOST,
    from: process.env.SMTP_FROM
  };
  process.env.SMTP_HOST = "smtp.test";
  process.env.SMTP_FROM = from;
  return () => {
    if (prev.host === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = prev.host;
    if (prev.from === undefined) delete process.env.SMTP_FROM;
    else process.env.SMTP_FROM = prev.from;
  };
}

function withSmtpUnset(): () => void {
  const prev = {
    host: process.env.SMTP_HOST,
    from: process.env.SMTP_FROM,
    user: process.env.SMTP_USER
  };
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  delete process.env.SMTP_USER;
  return () => {
    if (prev.host !== undefined) process.env.SMTP_HOST = prev.host;
    if (prev.from !== undefined) process.env.SMTP_FROM = prev.from;
    if (prev.user !== undefined) process.env.SMTP_USER = prev.user;
  };
}

function eqArrays(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function bookingInfo(over: Partial<BookingNotification>): BookingNotification {
  return {
    bookingId: "tok",
    name: "Visitor",
    subject: "",
    contactMethod: "WeChat",
    contactValue: "wx-id",
    eventTitle: "Spring shoot",
    slotStart: new Date("2026-08-01T14:00:00Z"),
    slotEnd: new Date("2026-08-01T15:00:00Z"),
    manageUrl: "https://example.com/zh/my-booking/tok",
    locale: "zh",
    visitorEmail: "",
    ownerEmail: "",
    ...over
  };
}

/**
 * The gate. With nothing configured and no transport injected, a send must be a
 * deliberate no-op — not an error, and above all not an actual delivery attempt.
 * This is the whole "a deploy without SMTP behaves as before" guarantee.
 */
async function testUnconfiguredIsNoOp() {
  const reset = withSmtpUnset();
  const configured = config.isMailConfigured();
  const result = await sendMail({
    to: "someone@test",
    subject: "hi",
    text: "body"
  });
  reset();

  report(
    "mail: unconfigured SMTP reports not-configured",
    !configured,
    `isMailConfigured()=${configured} with SMTP_* unset (want false)`
  );
  report(
    "mail: an unconfigured send is skipped, not attempted",
    result.sent === false && "skipped" in result && result.skipped === true,
    `result=${JSON.stringify(result)} (want { sent:false, skipped:true })`
  );
}

/** Configured + a transport: exactly one message goes out, with our fields. */
async function testConfiguredSendsOnce() {
  const reset = withSmtpConfigured("From <from@test>");
  const fake = fakeTransport();
  const result = await sendMail(
    { to: "to@test", subject: "Subject line", text: "Body text" },
    fake.transport
  );
  reset();

  const one = fake.sent.length === 1 ? fake.sent[0] : undefined;
  report(
    "mail: a configured send delivers exactly one message",
    result.sent === true && fake.sent.length === 1,
    `result=${JSON.stringify(result)}, sent ${fake.sent.length} (want sent:true / 1)`
  );
  report(
    "mail: the delivered message carries the given to/subject and the configured From",
    !!one &&
      one.to === "to@test" &&
      one.subject === "Subject line" &&
      one.from === "From <from@test>",
    `to=${one?.to} subject=${one?.subject} from=${one?.from}`
  );
}

/** An empty recipient is a no-op even when SMTP is configured. */
async function testEmptyRecipientSkipped() {
  const reset = withSmtpConfigured();
  const fake = fakeTransport();
  const result = await sendMail(
    { to: "   ", subject: "x", text: "y" },
    fake.transport
  );
  reset();
  report(
    "mail: a blank recipient sends nothing",
    result.sent === false && fake.sent.length === 0,
    `result=${JSON.stringify(result)}, sent ${fake.sent.length} (want skipped / 0)`
  );
}

/**
 * The selection rule, on its own. This is the test the plan calls out as the
 * verify-can-fail canary: break resolveBookingRecipients (e.g. always return [])
 * and these four assertions go red.
 */
function testResolveBookingRecipients() {
  const visitorOnly = resolveBookingRecipients({
    visitorEmail: "v@test",
    ownerEmail: ""
  });
  const ownerOnly = resolveBookingRecipients({
    visitorEmail: "",
    ownerEmail: "o@test"
  });
  const both = resolveBookingRecipients({
    visitorEmail: "v@test",
    ownerEmail: "o@test"
  });
  const neither = resolveBookingRecipients({
    visitorEmail: "  ",
    ownerEmail: ""
  });

  report(
    "recipients: visitor address only reaches the visitor",
    eqArrays(visitorOnly, ["v@test"]),
    `got ${JSON.stringify(visitorOnly)} (want ["v@test"])`
  );
  report(
    "recipients: owner address only reaches the owner",
    eqArrays(ownerOnly, ["o@test"]),
    `got ${JSON.stringify(ownerOnly)} (want ["o@test"])`
  );
  report(
    "recipients: both addresses reach both, visitor first",
    eqArrays(both, ["v@test", "o@test"]),
    `got ${JSON.stringify(both)} (want ["v@test","o@test"])`
  );
  report(
    "recipients: no usable address reaches no one",
    eqArrays(neither, []),
    `got ${JSON.stringify(neither)} (want [])`
  );
}

/**
 * A new booking mails the visitor (a confirmation) and the owner (an alert),
 * each only when they have an address — and the two emails are not the same
 * message.
 */
async function testNotifyBookingCreated() {
  const reset = withSmtpConfigured();

  const both = fakeTransport();
  await notifyBookingCreated(
    bookingInfo({
      visitorEmail: "v@test",
      ownerEmail: "o@test",
      dashboardUrl: "https://example.com/zh/dashboard/bookings/evt1"
    }),
    both.transport
  );
  const toSet = new Set(both.sent.map((m) => m.to));
  const subjects = both.sent.map((m) => m.subject);
  report(
    "booking created: both parties are emailed when both have an address",
    both.sent.length === 2 && toSet.has("v@test") && toSet.has("o@test"),
    `sent ${both.sent.length} to ${JSON.stringify([...toSet])} (want v@test & o@test)`
  );
  report(
    "booking created: the visitor and owner get different messages",
    new Set(subjects).size === 2,
    `subjects=${JSON.stringify(subjects)} (want two distinct)`
  );
  // The owner alert deliberately stays bilingual — the photographer sees
  // visitors from both sites and has no single booking locale.
  const ownerMsg = both.sent.find((m) => m.to === "o@test");
  report(
    "booking created: the owner alert stays bilingual",
    !!ownerMsg &&
      ownerMsg.text.includes("A new booking has been made") &&
      ownerMsg.text.includes("收到一条新预约"),
    `owner text=${JSON.stringify(ownerMsg?.text.slice(0, 48))} (want EN + 中文)`
  );
  // The owner alert now also carries the styled HTML card — bilingual, with the
  // dashboard deep-link — same interface the visitor email got.
  report(
    "booking created: the owner alert has a bilingual HTML card with the dashboard link",
    !!ownerMsg &&
      typeof ownerMsg.html === "string" &&
      ownerMsg.html.includes("收到新预约") &&
      ownerMsg.html.includes("Event · 活动") &&
      ownerMsg.html.includes("https://example.com/zh/dashboard/bookings/evt1"),
    `owner html present=${typeof ownerMsg?.html === "string"}`
  );

  const visitorOnly = fakeTransport();
  await notifyBookingCreated(
    bookingInfo({ visitorEmail: "v@test", ownerEmail: "" }),
    visitorOnly.transport
  );
  report(
    "booking created: an owner with no address is not emailed",
    visitorOnly.sent.length === 1 && visitorOnly.sent[0].to === "v@test",
    `sent ${visitorOnly.sent.length} to ${JSON.stringify(visitorOnly.sent.map((m) => m.to))} (want 1 / v@test)`
  );

  const noneFake = fakeTransport();
  await notifyBookingCreated(
    bookingInfo({ visitorEmail: "", ownerEmail: "" }),
    noneFake.transport
  );
  report(
    "booking created: nobody is emailed when there is no address at all",
    noneFake.sent.length === 0,
    `sent ${noneFake.sent.length} (want 0)`
  );

  reset();
}

/**
 * The visitor's email is written in the *one* language they booked in (carried
 * on `locale`), not both — a zh booking never leaks English and vice versa.
 * This is the verify-can-fail canary for the localisation: revert visitorMessage
 * to the old bilingual body and both halves of each assertion go red.
 */
async function testVisitorEmailLanguage() {
  const reset = withSmtpConfigured();

  const zh = fakeTransport();
  await notifyBookingStatusChanged(
    bookingInfo({ visitorEmail: "v@test", locale: "zh" }),
    "confirmed",
    zh.transport
  );
  const zhMsg = zh.sent[0];
  report(
    "visitor email: a zh booking is written in Chinese only",
    !!zhMsg &&
      zhMsg.subject === "预约已确认" &&
      zhMsg.text.includes("您的预约已确认") &&
      !zhMsg.text.toLowerCase().includes("your booking is confirmed"),
    `subject=${zhMsg?.subject}, text=${JSON.stringify(zhMsg?.text.slice(0, 40))}`
  );

  const en = fakeTransport();
  await notifyBookingStatusChanged(
    bookingInfo({ visitorEmail: "v@test", locale: "en" }),
    "confirmed",
    en.transport
  );
  const enMsg = en.sent[0];
  report(
    "visitor email: an en booking is written in English only",
    !!enMsg &&
      enMsg.subject === "Booking confirmed" &&
      enMsg.text.includes("your booking is confirmed") &&
      !enMsg.text.includes("您的预约"),
    `subject=${enMsg?.subject}, text=${JSON.stringify(enMsg?.text.slice(0, 40))}`
  );

  reset();
}

/**
 * The visitor's email carries a styled HTML body that mirrors the booking card:
 * the event title, the details, and a link back to the manage page. Owner alerts
 * remain plain text — HTML is only for the visitor-facing confirmation.
 */
async function testVisitorEmailHtml() {
  const reset = withSmtpConfigured();
  const fake = fakeTransport();
  await notifyBookingStatusChanged(
    bookingInfo({
      visitorEmail: "v@test",
      locale: "en",
      eventTitle: "Spring shoot",
      pricePerPerson: "CAD 50",
      manageUrl: "https://example.com/en/my-booking/tok"
    }),
    "confirmed",
    fake.transport
  );
  const msg = fake.sent[0];
  report(
    "visitor email: carries an HTML body mirroring the booking card",
    !!msg &&
      typeof msg.html === "string" &&
      msg.html.includes("Spring shoot") &&
      msg.html.includes("Price per person") &&
      msg.html.includes("CAD 50") &&
      msg.text.includes("Price per person: CAD 50") &&
      msg.html.includes("https://example.com/en/my-booking/tok"),
    `html present=${typeof msg?.html === "string"}, len=${msg?.html?.length ?? 0}`
  );
  // A crafted event title must not be able to break out of the HTML body.
  const injected = fakeTransport();
  await notifyBookingStatusChanged(
    bookingInfo({
      visitorEmail: "v@test",
      locale: "en",
      eventTitle: "<script>alert(1)</script>"
    }),
    "confirmed",
    injected.transport
  );
  const injMsg = injected.sent[0];
  report(
    "visitor email: HTML escapes user-supplied text",
    !!injMsg &&
      typeof injMsg.html === "string" &&
      !injMsg.html.includes("<script>alert(1)</script>") &&
      injMsg.html.includes("&lt;script&gt;"),
    `html contains escaped title=${injMsg?.html?.includes("&lt;script&gt;")}`
  );

  reset();
}

/** An announcement fans out to each non-empty address, once, same message. */
async function testNotifyAnnouncement() {
  const reset = withSmtpConfigured();
  const fake = fakeTransport();
  await notifyAnnouncement(
    {
      titleEn: "Booking open",
      titleZh: "预约开放",
      bodyEn: "March is open.",
      bodyZh: "三月已开放。",
      recipients: ["a@test", "", "b@test", "   "]
    },
    fake.transport
  );
  reset();

  const tos = fake.sent.map((m) => m.to).sort();
  report(
    "announcement: reaches each usable address exactly once, skipping blanks",
    eqArrays(tos, ["a@test", "b@test"]),
    `sent to ${JSON.stringify(tos)} (want a@test & b@test, no blanks)`
  );
  report(
    "announcement: the subject carries both languages",
    fake.sent.length > 0 &&
      fake.sent[0].subject.includes("Booking open") &&
      fake.sent[0].subject.includes("预约开放"),
    `subject=${JSON.stringify(fake.sent[0]?.subject)} (want both titles)`
  );
}

async function main() {
  await testUnconfiguredIsNoOp();
  await testConfiguredSendsOnce();
  await testEmptyRecipientSkipped();
  testResolveBookingRecipients();
  await testNotifyBookingCreated();
  await testVisitorEmailLanguage();
  await testVisitorEmailHtml();
  await testNotifyAnnouncement();
  console.log(
    `\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
