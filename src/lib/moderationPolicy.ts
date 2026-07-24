export const MODERATION_MODEL = "omni-moderation-2024-09-26" as const;

export const IMAGE_MODERATION_CATEGORIES = [
  "self-harm",
  "self-harm/intent",
  "self-harm/instructions",
  "sexual",
  "violence",
  "violence/graphic"
] as const;

export type ImageModerationCategory =
  (typeof IMAGE_MODERATION_CATEGORIES)[number];

export type PhotoModerationStatus =
  | "not_required"
  | "queued"
  | "processing"
  | "approved"
  | "review_required"
  | "rejected"
  | "error";

export type ModerationThresholds = Record<
  ImageModerationCategory,
  number | null
>;

export interface ModerationResultValue {
  flagged: boolean;
  categories: Record<string, boolean | null>;
  categoryScores: Record<string, number>;
  appliedInputTypes: Record<string, string[]>;
}

export interface ModerationTriggerReason {
  type: "provider_flag" | "category_flag" | "threshold";
  category?: ImageModerationCategory;
  score?: number;
  threshold?: number;
}

export interface ModerationDecisionValue {
  flagged: boolean;
  reasons: ModerationTriggerReason[];
  warningCategories: ImageModerationCategory[];
}

export function thresholdsFromSettings(settings: {
  moderationThresholdSelfHarm: number | null;
  moderationThresholdSelfHarmIntent: number | null;
  moderationThresholdSelfHarmInstructions: number | null;
  moderationThresholdSexual: number | null;
  moderationThresholdViolence: number | null;
  moderationThresholdViolenceGraphic: number | null;
}): ModerationThresholds {
  return {
    "self-harm": settings.moderationThresholdSelfHarm,
    "self-harm/intent": settings.moderationThresholdSelfHarmIntent,
    "self-harm/instructions":
      settings.moderationThresholdSelfHarmInstructions,
    sexual: settings.moderationThresholdSexual,
    violence: settings.moderationThresholdViolence,
    "violence/graphic": settings.moderationThresholdViolenceGraphic
  };
}

export function isModerationThresholds(
  value: unknown
): value is ModerationThresholds {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return IMAGE_MODERATION_CATEGORIES.every((category) => {
    const threshold = record[category];
    return (
      threshold === null ||
      (typeof threshold === "number" &&
        Number.isFinite(threshold) &&
        threshold >= 0 &&
        threshold <= 1)
    );
  });
}

export function warningCategoriesFromReasons(
  value: unknown
): ImageModerationCategory[] {
  if (!Array.isArray(value)) return [];
  const categories = new Set<ImageModerationCategory>();
  for (const reason of value) {
    if (!reason || typeof reason !== "object") continue;
    const category = (reason as { category?: unknown }).category;
    if (
      typeof category === "string" &&
      (IMAGE_MODERATION_CATEGORIES as readonly string[]).includes(category)
    ) {
      categories.add(category as ImageModerationCategory);
    }
  }
  return Array.from(categories);
}

/**
 * Provider flags are a non-relaxable floor. Custom thresholds can only make
 * review more sensitive, and only categories explicitly applicable to images
 * participate in score-based decisions.
 */
export function evaluateModeration(
  result: ModerationResultValue,
  thresholds: ModerationThresholds
): ModerationDecisionValue {
  const reasons: ModerationTriggerReason[] = [];
  const warningCategories = new Set<ImageModerationCategory>();

  if (result.flagged) reasons.push({ type: "provider_flag" });

  for (const category of IMAGE_MODERATION_CATEGORIES) {
    if (!result.appliedInputTypes[category]?.includes("image")) continue;
    const score = result.categoryScores[category];
    if (!Number.isFinite(score)) continue;

    if (result.categories[category] === true) {
      reasons.push({ type: "category_flag", category, score });
      warningCategories.add(category);
    }

    const threshold = thresholds[category];
    if (threshold !== null && score >= threshold) {
      reasons.push({ type: "threshold", category, score, threshold });
      warningCategories.add(category);
    }
  }

  return {
    flagged: reasons.length > 0,
    reasons,
    warningCategories: Array.from(warningCategories)
  };
}

export function parseModerationResponse(value: unknown): {
  id: string;
  model: string;
  result: ModerationResultValue;
} {
  if (!value || typeof value !== "object") {
    throw new Error("Malformed moderation response");
  }
  const response = value as Record<string, unknown>;
  const results = response.results;
  if (
    typeof response.id !== "string" ||
    typeof response.model !== "string" ||
    !Array.isArray(results) ||
    !results[0] ||
    typeof results[0] !== "object"
  ) {
    throw new Error("Malformed moderation response");
  }
  const raw = results[0] as Record<string, unknown>;
  if (
    typeof raw.flagged !== "boolean" ||
    !raw.categories ||
    typeof raw.categories !== "object" ||
    !raw.category_scores ||
    typeof raw.category_scores !== "object" ||
    !raw.category_applied_input_types ||
    typeof raw.category_applied_input_types !== "object"
  ) {
    throw new Error("Malformed moderation response");
  }

  const categories: Record<string, boolean | null> = {};
  for (const [key, category] of Object.entries(
    raw.categories as Record<string, unknown>
  )) {
    if (typeof category !== "boolean" && category !== null) {
      throw new Error("Malformed moderation categories");
    }
    categories[key] = category;
  }

  const categoryScores: Record<string, number> = {};
  for (const [key, score] of Object.entries(
    raw.category_scores as Record<string, unknown>
  )) {
    if (typeof score !== "number" || !Number.isFinite(score)) {
      throw new Error("Malformed moderation scores");
    }
    categoryScores[key] = score;
  }

  const appliedInputTypes: Record<string, string[]> = {};
  for (const [key, inputs] of Object.entries(
    raw.category_applied_input_types as Record<string, unknown>
  )) {
    if (!Array.isArray(inputs) || !inputs.every((item) => typeof item === "string")) {
      throw new Error("Malformed moderation input types");
    }
    appliedInputTypes[key] = inputs;
  }

  return {
    id: response.id,
    model: response.model,
    result: {
      flagged: raw.flagged,
      categories,
      categoryScores,
      appliedInputTypes
    }
  };
}
