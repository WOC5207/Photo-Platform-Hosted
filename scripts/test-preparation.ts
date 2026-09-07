import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { pickEquipment, setSlotFinished } from "../src/lib/preparation";

// Every fixture and mutation is inside one transaction that always rolls back.
// Existing accounts, bookings, and equipment are never touched.
const prisma = new PrismaClient();
const rollback = new Error("PREPARATION_TEST_ROLLBACK");

async function main() {
  try {
    await prisma.$transaction(async tx => {
      const suffix = randomUUID();
      const owner = await tx.user.create({ data: { username: "prep-test-" + suffix, passwordHash: "not-a-login" } });
      const other = await tx.user.create({ data: { username: "prep-other-" + suffix, passwordHash: "not-a-login" } });
      const date = new Date("2030-01-01T09:00:00Z");
      const event = await tx.bookingEvent.create({ data: { ownerId: owner.id, token: suffix, titleEn: "Preparation test", titleZh: "测试", date } });
      const day = await tx.bookingDay.create({ data: { bookingEventId: event.id, date } });
      const slot = await tx.timeSlot.create({ data: { bookingEventId: event.id, bookingDayId: day.id, startTime: date, endTime: new Date("2030-01-01T10:00:00Z") } });
      assert.equal((await setSlotFinished(tx, owner.id, slot.id, true)).count, 0, "Empty slots cannot be finished");
      const booking = await tx.booking.create({ data: { timeSlotId: slot.id, name: "Test visitor", cancelToken: randomUUID(), status: "cancelled" } });
      assert.equal((await setSlotFinished(tx, owner.id, slot.id, true)).count, 0, "Cancelled-only slots cannot be finished");
      await tx.booking.update({ where: { id: booking.id }, data: { status: "confirmed" } });
      assert.equal((await setSlotFinished(tx, other.id, slot.id, true)).count, 0, "Other tenants cannot finish slots");
      assert.equal((await setSlotFinished(tx, owner.id, slot.id, true)).count, 1);
      const finished = await tx.timeSlot.findUniqueOrThrow({ where: { id: slot.id } });
      assert.ok(finished.finishedAt);
      assert.equal((await setSlotFinished(tx, owner.id, slot.id, true)).count, 0, "Repeated finish preserves its timestamp");
      assert.equal((await tx.booking.findUniqueOrThrow({ where: { id: booking.id } })).status, "confirmed", "Completion does not cancel reservations");
      assert.equal(finished.capacity, 1);
      assert.equal((await setSlotFinished(tx, other.id, slot.id, false)).count, 0);
      await setSlotFinished(tx, owner.id, slot.id, false);
      assert.equal((await tx.timeSlot.findUniqueOrThrow({ where: { id: slot.id } })).finishedAt, null);

      const category = await tx.equipmentCategory.create({ data: { ownerId: owner.id, name: "Cameras", normalizedName: "cameras" } });
      const otherCategory = await tx.equipmentCategory.create({ data: { ownerId: other.id, name: "Other", normalizedName: "other" } });
      const camera = await tx.equipmentItem.create({ data: { ownerId: owner.id, categoryId: category.id, name: "Camera" } });
      const lens = await tx.equipmentItem.create({ data: { ownerId: owner.id, categoryId: category.id, name: "Lens" } });
      const foreign = await tx.equipmentItem.create({ data: { ownerId: other.id, categoryId: otherCategory.id, name: "Private" } });
      const list = await tx.equipmentChecklist.create({ data: { ownerId: owner.id, bookingDayId: day.id, name: "Packing" } });
      await pickEquipment(tx, other.id, list.id, [foreign.id]);
      await pickEquipment(tx, owner.id, list.id, [camera.id, foreign.id]);
      assert.equal(await tx.equipmentChecklistItem.count({ where: { checklistId: list.id } }), 0, "Cross-tenant picker submissions are rejected atomically");
      await pickEquipment(tx, owner.id, list.id, [camera.id, lens.id, camera.id]);
      assert.equal(await tx.equipmentChecklistItem.count({ where: { checklistId: list.id } }), 2, "Bulk selection deduplicates");
      await tx.equipmentChecklistItem.updateMany({ where: { checklistId: list.id, equipmentId: camera.id }, data: { checked: true } });
      await pickEquipment(tx, owner.id, list.id, [camera.id]);
      assert.equal(await tx.equipmentChecklistItem.count({ where: { checklistId: list.id } }), 2);
      assert.equal((await tx.equipmentChecklistItem.findFirstOrThrow({ where: { checklistId: list.id, equipmentId: camera.id } })).checked, true, "Re-adding preserves packed state");
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
  console.log("PASS: preparation completion, undo, tenant isolation, bulk selection and packed-state preservation (all fixtures rolled back).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
