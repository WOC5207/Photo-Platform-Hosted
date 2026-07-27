import assert from "node:assert/strict";
import { absoluteUrl, toBookingDto } from "../src/lib/miniapp/dto";

const booking = toBookingDto({
  id: "booking_1",
  status: "confirmed",
  name: "Visitor",
  subject: "Portrait",
  notes: "Window light",
  createdAt: new Date("2026-07-27T14:00:00.000Z"),
  lotteryEntry: {
    id: "entry_1",
    token: "ABCDEFGH",
    wonPrize: { name: "Print" }
  },
  timeSlot: {
    id: "slot_1",
    startTime: new Date("2026-08-03T09:30:00.000Z"),
    endTime: new Date("2026-08-03T10:00:00.000Z"),
    pricePerPerson: "CAD 50",
    descriptionEn: "Studio A",
    descriptionZh: "A 棚",
    bookingEvent: {
      token: "eventtoken",
      titleEn: "Portrait day",
      titleZh: "人像日",
      location: "Toronto",
      owner: {
        settings: {
          timeZone: "America/Toronto",
          bookingPriceEnabled: true
        }
      }
    }
  }
});

assert.deepEqual(booking.slot, {
  id: "slot_1",
  date: "2026-08-03",
  startTime: "09:30",
  endTime: "10:00",
  timeZone: "America/Toronto",
  pricePerPerson: "CAD 50",
  description: { en: "Studio A", zh: "A 棚" }
});
assert.deepEqual(booking.event.title, {
  en: "Portrait day",
  zh: "人像日"
});
assert.deepEqual(booking.lottery, {
  entryId: "entry_1",
  entryToken: "ABCDEFGH",
  prizeName: "Print"
});

const serialized = JSON.stringify(booking);
for (const forbidden of [
  "cancelToken",
  "contactValue",
  "contactMethod",
  "email",
  "openId",
  "session_key"
]) {
  assert.equal(
    serialized.includes(forbidden),
    false,
    `Booking DTO must not contain ${forbidden}`
  );
}

const previousNodeEnv = process.env["NODE_ENV"];
Reflect.set(process.env, "NODE_ENV", "production");
assert.throws(
  () => absoluteUrl("http://photos.example.test", "/api/image.webp"),
  /HTTPS/
);
if (previousNodeEnv === undefined) {
  Reflect.deleteProperty(process.env, "NODE_ENV");
} else {
  Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
}

console.log("miniapp booking privacy and wall-clock DTO checks passed");
