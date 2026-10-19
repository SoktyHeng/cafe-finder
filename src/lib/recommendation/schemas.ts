import { z } from "zod";

import { amenitySummarySchema } from "@/lib/community/schemas";
import { cafePlaceSchema } from "@/lib/places/schemas";

import { FACTORS } from "./config";

export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

export const factorResultSchema = z.strictObject({
  factor: z.enum(FACTORS),
  weight: z.number().min(0),
  /** 0–1 from evidence, or `null` when the evidence is unknown (scored as neutral). */
  score: z.number().min(0).max(1).nullable(),
});

export type FactorResult = z.infer<typeof factorResultSchema>;

/** CLAUDE.md §7.2 `Recommendation`, extended with a transparent breakdown. */
export const recommendationSchema = z.strictObject({
  cafe: cafePlaceSchema,
  /** Weighted score, 0–1. Unknown applicable factors count as neutral. */
  score: z.number().min(0).max(1),
  /** Whole-number percentage, or `null` when confidence is too low to show one. */
  matchPercent: z.number().int().min(0).max(100).nullable(),
  confidence: z.enum(CONFIDENCE_LEVELS),
  /** Share of the applicable weight backed by evidence, 0–1. */
  coverage: z.number().min(0).max(1),
  /** Only the factors that apply to this request (e.g. no budget if "any"). */
  factors: z.array(factorResultSchema),
  /** Positive, evidence-backed reasons. */
  knownMatchReasons: z.array(z.string()),
  /** Evidence-backed downsides or uncertainty worth knowing. */
  cautions: z.array(z.string()),
  /** Requested preferences no data source could confirm for this cafe. */
  unverifiedPreferences: z.array(z.string()),
  /**
   * Approved Cafe Finder member reports (first-party), kept apart from
   * `cafe` (Google/fixture data). Insufficient ones are shown but don't rank.
   */
  community: z.array(amenitySummarySchema).optional(),
});

export type Recommendation = z.infer<typeof recommendationSchema>;
