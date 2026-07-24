import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { sealData } from "iron-session";
import { prisma } from "@/lib/db";

const allowMutations = process.env.E2E_ALLOW_MUTATIONS === "1";
const sessionSecret =
  process.env.E2E_SESSION_SECRET ?? process.env.SESSION_SECRET;

const thresholds = {
  "self-harm": null,
  "self-harm/intent": null,
  "self-harm/instructions": null,
  sexual: 0.7,
  violence: null,
  "violence/graphic": 0.5
};

test.describe("post-publish moderation", () => {
  test.skip(
    !allowMutations || !sessionSecret,
    "Run against the disposable E2E app with E2E_SESSION_SECRET."
  );

  test("photographer warnings and flagged-only admin approval flow", async ({
    page,
    context
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "desktop-1280",
      "One desktop workflow covers the state transitions."
    );

    const suffix = randomUUID().slice(0, 8);
    const admin = await prisma.user.create({
      data: {
        username: `moderation-ui-admin-${suffix}`,
        displayName: "Moderation UI admin",
        passwordHash: "test-only-password-hash",
        role: "admin"
      },
      select: { id: true }
    });
    const session = await sealData(
      { userId: admin.id },
      { password: sessionSecret!, ttl: 60 * 60 }
    );
    await context.clearCookies();
    await context.addCookies([
      {
        name: "session",
        value: session,
        url: new URL(process.env.PLAYWRIGHT_BASE_URL!).origin,
        httpOnly: true,
        sameSite: "Lax"
      }
    ]);
    const event = await prisma.event.create({
      data: {
        ownerId: admin.id,
        slug: `moderation-ui-${suffix}`,
        titleEn: "Moderation UI fixture",
        titleZh: "Moderation UI fixture",
        published: true,
        photos: {
          create: [
            {
              filename: "queued-ui.webp",
              originalName: "queued-ui.jpg",
              width: 1280,
              height: 720,
              moderationStatus: "queued",
              moderationPolicyVersion: 3,
              moderationThresholds: thresholds
            },
            {
              filename: "flagged-ui.webp",
              originalName: "flagged-ui.jpg",
              width: 1280,
              height: 720,
              moderationStatus: "review_required",
              moderationPolicyVersion: 3,
              moderationThresholds: thresholds,
              moderationScans: {
                create: {
                  requestId: `e2e-${suffix}`,
                  requestedModel: "omni-moderation-2024-09-26",
                  returnedModel: "omni-moderation-2024-09-26",
                  policyVersion: 3,
                  attempt: 1,
                  providerFlagged: true,
                  categories: { violence: true },
                  categoryScores: { violence: 0.91 },
                  appliedInputTypes: { violence: ["image"] },
                  thresholds,
                  triggerReasons: [
                    {
                      type: "category_flag",
                      category: "violence",
                      score: 0.91
                    }
                  ],
                  startedAt: new Date()
                }
              },
              moderationReview: {
                create: { providerFlagged: true }
              }
            },
            {
              filename: "error-ui.webp",
              originalName: "error-ui.jpg",
              width: 1280,
              height: 720,
              moderationStatus: "error",
              moderationPolicyVersion: 3,
              moderationThresholds: thresholds
            },
            {
              filename: "rejected-ui.webp",
              originalName: "rejected-ui.jpg",
              width: 1280,
              height: 720,
              moderationStatus: "rejected",
              moderationPolicyVersion: 3,
              moderationThresholds: thresholds
            }
          ]
        }
      },
      include: {
        photos: {
          include: { moderationReview: true }
        }
      }
    });
    const flagged = event.photos.find(
      (photo) => photo.originalName === "flagged-ui.jpg"
    )!;

    try {
      await page.goto(`/en/dashboard/events/${event.id}`);
      await expect(
        page.getByText("Safety screening in progress", { exact: true })
      ).toBeVisible();
      await expect(
        page.getByText(
          "This photo is private and awaiting platform review.",
          { exact: true }
        )
      ).toBeVisible();
      await expect(
        page.getByText(
          "This photo is private because safety screening could not be completed.",
          { exact: true }
        )
      ).toBeVisible();
      await expect(
        page.getByText(
          "This photo was rejected by platform review and remains private.",
          { exact: true }
        )
      ).toBeVisible();

      await page.goto("/en/admin/moderation");
      await expect(
        page.getByRole("heading", { name: "Flagged photo queue" })
      ).toBeVisible();
      await expect(page.getByText("flagged-ui.jpg", { exact: true })).toBeVisible();
      await expect(page.getByText("queued-ui.jpg", { exact: true })).toHaveCount(0);
      await expect(page.getByText("error-ui.jpg", { exact: true })).toHaveCount(0);

      await page.getByRole("switch", { name: "Show details" }).click();
      const audit = page.getByRole("region", {
        name: "Uploaded photo details"
      });
      await expect(audit).toBeVisible();
      await expect(
        audit.getByText("queued-ui.jpg", { exact: true })
      ).toBeVisible();
      await expect(
        audit.getByText("error-ui.jpg", { exact: true })
      ).toBeVisible();
      const auditFlagged = audit
        .locator("li")
        .filter({ hasText: "flagged-ui.jpg" });
      await expect(auditFlagged.getByText("0.9100", { exact: true })).toBeVisible();
      await expect(
        auditFlagged.getByText("1,280 × 720", { exact: true })
      ).toBeVisible();
      await expect(
        auditFlagged.getByText(`e2e-${suffix}`, { exact: true })
      ).toBeVisible();
      await page.getByRole("switch", { name: "Hide details" }).click();
      await expect(audit).toHaveCount(0);

      const reviewCard = page.locator("li").filter({ hasText: "flagged-ui.jpg" });
      await expect(
        reviewCard.getByRole("button", { name: "Reveal photo" })
      ).toBeVisible();

      const approveForm = reviewCard.locator("form").filter({
        has: page.getByRole("button", { name: "Approve" })
      });
      await approveForm.getByLabel("Reviewer note").fill("E2E reviewer note");
      await approveForm.getByRole("button", { name: "Approve" }).click();
      await expect(page.getByText("flagged-ui.jpg", { exact: true })).toHaveCount(0);

      const approved = await prisma.photo.findUniqueOrThrow({
        where: { id: flagged.id },
        include: {
          moderationReview: { include: { decisions: true } }
        }
      });
      expect(approved.moderationStatus).toBe("approved");
      expect(approved.moderationReview?.decisions).toEqual([
        expect.objectContaining({
          action: "approve",
          note: "E2E reviewer note",
          reviewerId: admin.id
        })
      ]);

      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      expect(
        accessibility.violations.filter(
          (violation) =>
            violation.impact === "critical" || violation.impact === "serious"
        )
      ).toEqual([]);
    } finally {
      await prisma.event.deleteMany({ where: { id: event.id } });
      await prisma.user.deleteMany({ where: { id: admin.id } });
    }
  });
});
