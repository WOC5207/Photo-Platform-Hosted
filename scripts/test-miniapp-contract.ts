import assert from "node:assert/strict";
import {
  decodeCursor,
  encodeCursor,
  parsePageSize
} from "../src/lib/miniapp/cursor";
import {
  bookingCreateSchema,
  bookingImportSchema,
  contentReportSchema,
  deleteMeSchema,
  lotteryEntrySchema
} from "../src/lib/miniapp/schemas";
import {
  absoluteUrl,
  toPhotoDto,
  toSlotTimeDto
} from "../src/lib/miniapp/dto";

const secret = "test-only-cursor-secret-with-sufficient-entropy";
const cursor = encodeCursor(
  "photos:alice:album",
  [4, "2026-07-27T12:00:00.000Z", "photo_1"],
  secret
);
assert.deepEqual(
  decodeCursor(cursor, "photos:alice:album", secret),
  [4, "2026-07-27T12:00:00.000Z", "photo_1"],
  "cursor should round trip"
);
assert.equal(
  decodeCursor(cursor, "photos:bob:album", secret),
  null,
  "a cursor cannot be replayed against another list"
);
assert.equal(
  decodeCursor(`${cursor.slice(0, -1)}x`, "photos:alice:album", secret),
  null,
  "a tampered cursor must fail closed"
);
assert.equal(parsePageSize("500"), 50, "page size is capped at 50");
assert.equal(parsePageSize("0"), 20, "invalid page size uses the default");

assert.equal(
  bookingCreateSchema.safeParse({
    slotId: "slot_1",
    name: "Visitor",
    contactValue: "wechat-id"
  }).success,
  true
);
assert.equal(
  bookingCreateSchema.safeParse({
    slotId: "slot_1",
    name: "",
    contactValue: "wechat-id"
  }).success,
  false
);
assert.equal(
  bookingImportSchema.safeParse({ cancelToken: "abc/../../private" }).success,
  false,
  "legacy tokens remain body-only alphanumeric values"
);
assert.equal(
  lotteryEntrySchema.safeParse({
    name: "Visitor",
    contactValue: "wechat-id",
    unexpected: true
  }).success,
  false,
  "write payloads reject unknown fields"
);
assert.equal(
  contentReportSchema.safeParse({
    reason: "privacy",
    details: "Contains personal information"
  }).success,
  true
);
assert.equal(
  contentReportSchema.safeParse({ reason: "made_up_reason" }).success,
  false
);
assert.equal(
  deleteMeSchema.safeParse({ confirmation: "delete" }).success,
  false,
  "account deletion requires an exact second confirmation"
);

const slot = toSlotTimeDto(
  new Date("2026-07-27T09:30:00.000Z"),
  new Date("2026-07-27T10:00:00.000Z"),
  "America/Toronto"
);
assert.deepEqual(slot, {
  date: "2026-07-27",
  startTime: "09:30",
  endTime: "10:00",
  timeZone: "America/Toronto"
});

assert.equal(
  absoluteUrl("https://photos.example.test/base", "/api/image.webp"),
  "https://photos.example.test/api/image.webp"
);
const photo = toPhotoDto(
  {
    id: "photo_1",
    width: 1600,
    height: 1200,
    comment: "A public photo",
    credits: [
      {
        creditName: "Model",
        subject: "Portrait",
        socialLinks: []
      }
    ]
  },
  "event_1",
  "https://photos.example.test"
);
assert.equal(photo.public, true);
assert.equal(photo.urls.thumb.startsWith("https://"), true);
assert.equal("cancelToken" in photo, false);

console.log("miniapp cursor, DTO, and payload schema checks passed");
