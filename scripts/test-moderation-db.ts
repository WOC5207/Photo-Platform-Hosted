import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { runModerationJob } from "../src/lib/moderationWorker";

const prisma = new PrismaClient();

async function main() {
  const suffix = randomUUID().slice(0, 8);
  const owner = await prisma.user.create({
    data: {
      username: `moderation-owner-${suffix}`,
      displayName: "Moderation test owner",
      passwordHash: "test-only-password-hash"
    }
  });
  const reviewer = await prisma.user.create({
    data: {
      username: `moderation-admin-${suffix}`,
      displayName: "Moderation test admin",
      passwordHash: "test-only-password-hash",
      role: "admin"
    }
  });

  try {
    const event = await prisma.event.create({
      data: {
        ownerId: owner.id,
        slug: `moderation-${suffix}`,
        titleEn: "Moderation test",
        titleZh: "Moderation test",
        published: true
      }
    });
    const exempt = await prisma.photo.create({
      data: {
        eventId: event.id,
        filename: "existing.webp",
        originalName: "existing.webp",
        width: 1280,
        height: 720
      }
    });
    assert.equal(
      exempt.moderationStatus,
      "not_required",
      "existing/default photos must remain exempt"
    );

    const thresholds = {
      "self-harm": null,
      "self-harm/intent": null,
      "self-harm/instructions": null,
      sexual: 0.6,
      violence: null,
      "violence/graphic": 0.4
    };
    const retrying = await prisma.photo.create({
      data: {
        eventId: event.id,
        filename: "missing.webp",
        originalName: "missing.webp",
        width: 1280,
        height: 720,
        moderationStatus: "queued",
        moderationPolicyVersion: 7,
        moderationThresholds: thresholds
      }
    });

    process.env.MODERATION_MAX_ATTEMPTS = "2";
    await runModerationJob(retrying.id);
    let job = await prisma.photo.findUniqueOrThrow({
      where: { id: retrying.id }
    });
    assert.equal(job.moderationStatus, "queued");
    assert.equal(job.moderationAttempts, 1);
    assert.ok(job.moderationNextRetryAt, "a bounded retry must be durable");

    await prisma.photo.update({
      where: { id: retrying.id },
      data: { moderationNextRetryAt: new Date(0) }
    });
    await runModerationJob(retrying.id);
    job = await prisma.photo.findUniqueOrThrow({ where: { id: retrying.id } });
    assert.equal(job.moderationStatus, "error");
    assert.equal(job.moderationAttempts, 2);
    assert.equal(job.moderationNextRetryAt, null);

    const stale = await prisma.photo.create({
      data: {
        eventId: event.id,
        filename: "stale.webp",
        originalName: "stale.webp",
        width: 1280,
        height: 720,
        moderationStatus: "processing",
        moderationPolicyVersion: 7,
        moderationThresholds: thresholds,
        moderationClaimedAt: new Date(0),
        moderationAttempts: 1
      }
    });
    await runModerationJob(stale.id);
    const recovered = await prisma.photo.findUniqueOrThrow({
      where: { id: stale.id }
    });
    assert.equal(recovered.moderationStatus, "error");
    assert.equal(recovered.moderationAttempts, 2);

    const flagged = await prisma.photo.create({
      data: {
        eventId: event.id,
        filename: "flagged.webp",
        originalName: "flagged.webp",
        width: 1280,
        height: 720,
        moderationStatus: "review_required",
        moderationPolicyVersion: 7,
        moderationThresholds: thresholds,
        moderationAttempts: 1,
        moderationScans: {
          create: {
            requestId: `request-${suffix}`,
            requestedModel: "omni-moderation-2024-09-26",
            returnedModel: "omni-moderation-2024-09-26",
            policyVersion: 7,
            attempt: 1,
            providerFlagged: true,
            categories: { violence: true },
            categoryScores: { violence: 0.9 },
            appliedInputTypes: { violence: ["image"] },
            thresholds,
            triggerReasons: [
              { type: "category_flag", category: "violence", score: 0.9 }
            ],
            startedAt: new Date()
          }
        },
        moderationReview: {
          create: {
            providerFlagged: true,
            decisions: {
              create: {
                reviewerId: reviewer.id,
                action: "approve",
                note: "Required provider-flag override note"
              }
            }
          }
        }
      },
      include: {
        moderationScans: true,
        moderationReview: { include: { decisions: true } }
      }
    });
    assert.equal(flagged.moderationScans[0].policyVersion, 7);
    assert.deepEqual(flagged.moderationScans[0].thresholds, thresholds);
    assert.equal(flagged.moderationReview?.decisions.length, 1);

    const deletionRace = await prisma.photo.create({
      data: {
        eventId: event.id,
        filename: "deleted.webp",
        originalName: "deleted.webp",
        width: 1280,
        height: 720,
        moderationStatus: "queued",
        moderationPolicyVersion: 7,
        moderationThresholds: thresholds
      }
    });
    await prisma.photo.delete({ where: { id: deletionRace.id } });
    await runModerationJob(deletionRace.id);
    assert.equal(
      await prisma.photo.count({ where: { id: deletionRace.id } }),
      0,
      "a deleted photo must not be recreated by a queued job"
    );

    await assert.rejects(
      prisma.$executeRawUnsafe(
        `UPDATE "Photo" SET "moderationStatus" = 'invalid' WHERE id = $1`,
        exempt.id
      ),
      /check constraint|violates/i,
      "the database must reject unknown lifecycle states"
    );

    console.log("Moderation persistence, retry, recovery, and audit tests passed.");
  } finally {
    // The reviewer relation is intentionally RESTRICT so audit actors cannot
    // disappear while decisions exist. Removing the owner's events cascades
    // the test review/decisions first, after which the reviewer can be removed.
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.user.delete({ where: { id: reviewer.id } });
    await prisma.$disconnect();
  }
}

void main();
