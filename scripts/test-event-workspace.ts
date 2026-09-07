import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { addGalleryToBooking, createEventWorkspace, ensureDayChecklists, validEventDates } from "../src/lib/eventWorkspace";

const prisma = new PrismaClient();
const rollback = new Error("WORKSPACE_TEST_ROLLBACK");
const suffix = randomUUID();
const username = "workspace-test-" + suffix;
const details = {
  titleEn: "Portrait session", titleZh: "人像拍摄", descriptionEn: "Studio day",
  descriptionZh: "", location: "Test studio", visitorEditsEnabled: false, visitorEditCutoffHours: 24
};

async function main() {
  assert.deepEqual(validEventDates(["2030-01-02", "2030-01-01", "2030-01-01"]), ["2030-01-01", "2030-01-02"]);
  for (const invalid of [[], ["2030-02-30"], ["invalid"], ["2030-01-01", 42], Array(61).fill("2030-01-01")]) {
    assert.equal(validEventDates(invalid), null);
  }
  try {
    await prisma.$transaction(async tx => {
      const owner = await tx.user.create({ data: { username, passwordHash: "not-a-login" } });
      const other = await tx.user.create({ data: { username: "workspace-other-" + suffix, passwordHash: "not-a-login" } });
      const result = await createEventWorkspace(tx, owner.id, details, ["2030-01-01", "2030-01-02"], "en");
      const gallery = await tx.event.findUniqueOrThrow({ where: { id: result.galleryId } });
      const booking = await tx.bookingEvent.findUniqueOrThrow({ where: { id: result.bookingId }, include: { days: true } });
      assert.equal(gallery.published, false);
      assert.equal(booking.open, false);
      assert.equal(booking.galleryEventId, gallery.id);
      assert.equal(booking.days.length, 2);
      assert.equal(gallery.ownerId, owner.id);
      assert.equal(booking.ownerId, owner.id);
      assert.equal(gallery.titleEn, booking.titleEn);
      assert.equal(gallery.dateStart?.toISOString().slice(0, 10), "2030-01-01");
      assert.equal(gallery.dateEnd?.toISOString().slice(0, 10), "2030-01-02");
      const lists = await tx.equipmentChecklist.findMany({ where: { ownerId: owner.id } });
      assert.equal(lists.length, 2);
      assert.ok(lists.every(list => booking.days.some(day => day.id === list.bookingDayId)));
      await tx.equipmentChecklistItem.create({ data: { checklistId: lists[0].id, label: "Packed camera", checked: true } });
      const repeated = await createEventWorkspace(tx, owner.id, details, ["2030-01-01"], "en", gallery.id);
      assert.deepEqual(repeated, result, "Legacy setup is idempotent for already linked galleries");
      await tx.bookingDay.create({ data: { bookingEventId: booking.id, date: new Date("2030-01-03T00:00:00Z") } });
      await ensureDayChecklists(tx, owner.id, booking.id, "en");
      assert.equal(await tx.equipmentChecklist.count({ where: { ownerId: owner.id } }), 3);
      assert.equal((await tx.equipmentChecklistItem.findFirstOrThrow({ where: { checklistId: lists[0].id } })).checked, true);
      await assert.rejects(() => createEventWorkspace(tx, other.id, details, ["2030-01-01"], "en", gallery.id), /Gallery not found/);
      assert.equal(await addGalleryToBooking(tx, other.id, booking.id, "en"), null);
      assert.equal(await tx.event.count({ where: { ownerId: other.id } }), 0);
      const second = await createEventWorkspace(tx, owner.id, details, ["2030-02-01"], "zh");
      assert.notEqual((await tx.event.findUniqueOrThrow({ where: { id: second.galleryId } })).slug, gallery.slug);

      // Gallery-only legacy data can opt in without changing its public slug.
      const legacyGallery = await tx.event.create({ data: { ownerId: owner.id, slug: "existing", titleEn: "Existing", titleZh: "", published: true } });
      const attached = await createEventWorkspace(tx, owner.id, details, ["2030-03-01"], "en", legacyGallery.id);
      assert.equal(attached.galleryId, legacyGallery.id);
      assert.equal((await tx.event.findUniqueOrThrow({ where: { id: legacyGallery.id } })).published, true);

      // Component deletion retains its partner and the original booking token.
      await tx.event.delete({ where: { id: gallery.id } });
      assert.equal((await tx.bookingEvent.findUniqueOrThrow({ where: { id: booking.id } })).galleryEventId, null);
      const replacement = await addGalleryToBooking(tx, owner.id, booking.id, "en");
      assert.ok(replacement);
      assert.equal((await tx.bookingEvent.findUniqueOrThrow({ where: { id: booking.id } })).token, booking.token);
      assert.equal((await tx.equipmentChecklistItem.findFirstOrThrow({ where: { checklistId: lists[0].id } })).checked, true);
      assert.equal(await addGalleryToBooking(tx, owner.id, booking.id, "en"), replacement);
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) {
    if (error !== rollback) throw error;
  }
  assert.equal(await prisma.user.count({ where: { username } }), 0, "Atomic rollback removes all partial workspace writes");
  await prisma.$disconnect();
  console.log("PASS: atomic workspace creation/rollback, draft defaults, daily checklists, date validation, tenant isolation, legacy setup, unique slugs and data preservation.");
}
main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exitCode = 1; });
