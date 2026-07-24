import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  evaluateModeration,
  parseModerationResponse,
  type ModerationResultValue,
  type ModerationThresholds
} from "../src/lib/moderationPolicy";

const noThresholds: ModerationThresholds = {
  "self-harm": null,
  "self-harm/intent": null,
  "self-harm/instructions": null,
  sexual: null,
  violence: null,
  "violence/graphic": null
};

function result(
  overrides: Partial<ModerationResultValue> = {}
): ModerationResultValue {
  return {
    flagged: false,
    categories: {},
    categoryScores: {},
    appliedInputTypes: {},
    ...overrides
  };
}

assert.equal(
  evaluateModeration(result({ flagged: true }), noThresholds).flagged,
  true,
  "the provider top-level flag must always require review"
);

assert.equal(
  evaluateModeration(
    result({
      categoryScores: { sexual: 0.7 },
      appliedInputTypes: { sexual: ["image"] }
    }),
    { ...noThresholds, sexual: 0.7 }
  ).flagged,
  true,
  "a score exactly on the configured threshold must require review"
);

assert.equal(
  evaluateModeration(
    result({
      categoryScores: { sexual: 1 },
      appliedInputTypes: { sexual: ["image"] }
    }),
    noThresholds
  ).flagged,
  false,
  "a nullable threshold must rely on provider flags only"
);

assert.equal(
  evaluateModeration(
    result({
      categoryScores: { violence: 1 },
      appliedInputTypes: { violence: ["text"] }
    }),
    { ...noThresholds, violence: 0.1 }
  ).flagged,
  false,
  "text-only applicability must not influence an image decision"
);

assert.equal(
  evaluateModeration(
    result({
      categories: { harassment: true },
      categoryScores: { harassment: 1 },
      appliedInputTypes: { harassment: ["text"] }
    }),
    noThresholds
  ).flagged,
  false,
  "unsupported text-only categories must be ignored"
);

assert.throws(
  () => parseModerationResponse({ results: [] }),
  /Malformed moderation response/,
  "malformed provider responses must fail closed"
);

async function main() {
  const photoRoute = await readFile(
    new URL("../src/app/api/admin/photos/route.ts", import.meta.url),
    "utf8"
  );
  const patchStart = photoRoute.indexOf("export async function PATCH");
  assert.ok(patchStart > 0, "publish PATCH route must exist");
  assert.equal(
    photoRoute.slice(0, patchStart).includes("enqueueModeration("),
    false,
    "upload, compression selection, and confirmation must not enqueue moderation"
  );
  assert.ok(
    photoRoute.slice(patchStart).includes("enqueueModeration("),
    "only the post-publish path should enqueue moderation"
  );
  assert.equal(
    photoRoute.includes("moderateImage("),
    false,
    "the request route must never call the provider synchronously"
  );

  console.log("Moderation policy and post-publish boundary tests passed.");
}

void main();
