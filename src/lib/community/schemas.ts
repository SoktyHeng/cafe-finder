import { z } from "zod";

import { PLACE_ID_PATTERN } from "@/lib/places/schemas";

/**
 * Community (Cafe Finder member) contributions. Mirrors the M6 migration's
 * constraints. This is first-party data, always labelled as such and never
 * mixed into Google Places fields.
 */

export const COMMUNITY_AMENITIES = ["wifi", "outlets", "noise", "seating", "laptop_friendly"] as const;
export type CommunityAmenity = (typeof COMMUNITY_AMENITIES)[number];

export function isCommunityAmenity(value: string | null | undefined): value is CommunityAmenity {
  return value != null && (COMMUNITY_AMENITIES as readonly string[]).includes(value);
}

/**
 * Allowed answers per amenity, in display order, with a 0–1 score meaning
 * "how good is this for someone who wants the amenity".
 */
export const AMENITY_OPTIONS = {
  wifi: { label: "Wi-Fi", values: { yes: { label: "Available", score: 1 }, no: { label: "Not available", score: 0 } } },
  outlets: {
    label: "Power outlets",
    values: {
      many: { label: "Plenty", score: 1 },
      some: { label: "A few", score: 0.6 },
      none: { label: "None", score: 0 },
    },
  },
  noise: {
    label: "Noise level",
    values: {
      quiet: { label: "Quiet", score: 1 },
      moderate: { label: "Moderate", score: 0.5 },
      loud: { label: "Loud", score: 0 },
    },
  },
  seating: {
    label: "Seating comfort",
    values: {
      comfortable: { label: "Comfortable", score: 1 },
      ok: { label: "Okay", score: 0.6 },
      uncomfortable: { label: "Uncomfortable", score: 0.1 },
    },
  },
  laptop_friendly: {
    label: "Laptop-friendly",
    values: { yes: { label: "Yes", score: 1 }, no: { label: "No", score: 0 } },
  },
} as const satisfies Record<CommunityAmenity, { label: string; values: Record<string, { label: string; score: number }> }>;

export type AmenityValue<A extends CommunityAmenity = CommunityAmenity> = keyof (typeof AMENITY_OPTIONS)[A]["values"] & string;

export function isValidAmenityValue(amenity: CommunityAmenity, value: string): boolean {
  return Object.hasOwn(AMENITY_OPTIONS[amenity].values, value);
}

export function amenityValueOption(amenity: CommunityAmenity, value: string): { label: string; score: number } | undefined {
  const values = AMENITY_OPTIONS[amenity].values as Record<string, { label: string; score: number }>;
  return Object.hasOwn(values, value) ? values[value] : undefined;
}

export const CONTENT_STATUSES = ["approved", "pending", "hidden", "rejected"] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const FLAG_REASONS = ["spam", "offensive", "incorrect", "personal_info", "other"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const REVIEW_MIN_LENGTH = 20;
export const REVIEW_MAX_LENGTH = 1000;

const placeId = z.string().regex(PLACE_ID_PATTERN, "Invalid place ID");
const isoDate = z.iso.date();

/** One amenity answer from a member. */
export const amenityAnswerSchema = z
  .strictObject({ amenity: z.enum(COMMUNITY_AMENITIES), value: z.string().max(32) })
  .refine((answer) => isValidAmenityValue(answer.amenity, answer.value), {
    message: "Invalid value for this amenity",
    path: ["value"],
  });

/** Submit or update several amenity answers for one place at once. */
export const amenityReportInputSchema = z.strictObject({
  answers: z
    .array(amenityAnswerSchema)
    .min(1)
    .max(COMMUNITY_AMENITIES.length)
    .refine((answers) => new Set(answers.map((answer) => answer.amenity)).size === answers.length, {
      message: "Each amenity at most once",
    }),
  observedOn: isoDate,
});
export type AmenityReportInput = z.infer<typeof amenityReportInputSchema>;

/** Control characters (other than newlines/tabs) are stripped; React escapes the rest on display. */
const plainText = (min: number, max: number) =>
  z
    .string()
    .transform((value) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .pipe(z.string().min(min, `Write at least ${min} characters.`).max(max, `Use at most ${max} characters.`));

export const reviewInputSchema = z.strictObject({
  rating: z.number().int().min(1).max(5),
  body: plainText(REVIEW_MIN_LENGTH, REVIEW_MAX_LENGTH),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const voteInputSchema = z.strictObject({ helpful: z.boolean() });

export const flagInputSchema = z.strictObject({
  targetType: z.enum(["amenity_report", "review"]),
  targetId: z.uuid(),
  reason: z.enum(FLAG_REASONS),
});
export type FlagInput = z.infer<typeof flagInputSchema>;

export const moderationDecisionSchema = z.strictObject({
  targetType: z.enum(["amenity_report", "review"]),
  targetId: z.uuid(),
  decision: z.enum(["approved", "rejected"]),
});
export type ModerationDecision = z.infer<typeof moderationDecisionSchema>;

export { placeId as communityPlaceIdSchema };

// ---------------------------------------------------------------- read models

/** An approved, anonymized amenity report (from `community_amenity_reports`). */
export type CommunityReport = {
  placeId: string;
  amenity: CommunityAmenity;
  value: string;
  /** YYYY-MM-DD */
  observedOn: string;
  confirmedVisit: boolean;
};

export const amenitySummarySchema = z.strictObject({
  amenity: z.enum(COMMUNITY_AMENITIES),
  /** The value with the most (weighted) support. */
  consensus: z.string(),
  /** Share of weight behind the consensus value, 0–1. */
  agreement: z.number().min(0).max(1),
  /** Weighted mean of value scores, 0–1. */
  score: z.number().min(0).max(1),
  reportCount: z.number().int().min(0),
  confirmedVisitCount: z.number().int().min(0),
  latestObservedOn: isoDate,
  /** Reports disagree too much to state a consensus. */
  conflicted: z.boolean(),
  /** Enough (recent, weighted) reports to influence recommendations. */
  sufficient: z.boolean(),
});
export type AmenitySummary = z.infer<typeof amenitySummarySchema>;

export const communityReviewSchema = z.strictObject({
  id: z.uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string(),
  createdAt: z.string(),
  edited: z.boolean(),
  confirmedVisit: z.boolean(),
  helpfulCount: z.number().int().min(0),
  notHelpfulCount: z.number().int().min(0),
  isOwn: z.boolean(),
});
export type CommunityReview = z.infer<typeof communityReviewSchema>;

/** The signed-in member's own contributions for one place (any status). */
export const myContributionsSchema = z.strictObject({
  reports: z.array(
    z.strictObject({
      id: z.uuid(),
      amenity: z.enum(COMMUNITY_AMENITIES),
      value: z.string(),
      observedOn: isoDate,
      status: z.enum(CONTENT_STATUSES),
    }),
  ),
  review: z
    .strictObject({ id: z.uuid(), rating: z.number().int(), body: z.string(), status: z.enum(CONTENT_STATUSES) })
    .nullable(),
  votes: z.record(z.string(), z.boolean()),
  flaggedReviewIds: z.array(z.string()),
});
export type MyContributions = z.infer<typeof myContributionsSchema>;

export const communityPlaceResponseSchema = z.strictObject({
  placeId: z.string(),
  amenities: z.array(amenitySummarySchema),
  reviews: z.array(communityReviewSchema),
  /** Present only for signed-in members. */
  mine: myContributionsSchema.nullable(),
});
export type CommunityPlaceResponse = z.infer<typeof communityPlaceResponseSchema>;
