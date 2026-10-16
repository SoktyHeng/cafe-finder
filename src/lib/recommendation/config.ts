import { z } from "zod";

/**
 * Recommendation scoring configuration. The weights are initial hypotheses
 * (CLAUDE.md §7.2), not calibrated truths. Change them here; every value is
 * validated, and docs/recommendation-scoring.md explains each one.
 */

export const FACTORS = [
  "rating",
  "distance",
  "openNow",
  "atmosphere",
  "budget",
  "amenities",
] as const;
export type Factor = (typeof FACTORS)[number];

const weight = z.number().finite().min(0).max(100);

export const scoringConfigSchema = z
  .strictObject({
    /** Relative importance of each factor. Only the ratios matter. */
    weights: z.strictObject({
      rating: weight,
      distance: weight,
      openNow: weight,
      atmosphere: weight,
      budget: weight,
      amenities: weight,
    }),
    rating: z.strictObject({
      /** Bayesian prior: typical cafe rating that sparse ratings are pulled toward. */
      priorMean: z.number().min(1).max(5),
      /** Prior strength in "virtual reviews". Higher = more skeptical of few reviews. */
      priorWeight: z.number().min(0),
      /** Adjusted ratings at or below `floor` score 0; at `ceiling`, 1. */
      floor: z.number().min(0).max(5),
      ceiling: z.number().min(0).max(5),
      /** Below this many reviews the rating is flagged as less certain. */
      fewReviewsThreshold: z.number().int().min(0),
      /** Review count needed (with enough coverage) for "high" confidence. */
      reliableReviewCount: z.number().int().min(0),
    }),
    distance: z.strictObject({
      /** "Very close" reason threshold. */
      veryCloseMeters: z.number().min(0),
      /** Beyond this share of the radius, add an "edge of your search area" caution. */
      edgeOfRadiusRatio: z.number().min(0).max(1),
    }),
    /** Score assumed for an applicable factor with no evidence: neutral. */
    unknownFactorScore: z.number().min(0).max(1),
    confidence: z.strictObject({
      /** Minimum share of applicable weight backed by evidence. */
      highCoverage: z.number().min(0).max(1),
      mediumCoverage: z.number().min(0).max(1),
    }),
  })
  .refine(({ weights }) => Object.values(weights).some((value) => value > 0), {
    message: "At least one weight must be positive",
    path: ["weights"],
  })
  .refine(({ rating }) => rating.floor < rating.ceiling, {
    message: "rating.floor must be below rating.ceiling",
    path: ["rating"],
  })
  .refine(({ confidence }) => confidence.mediumCoverage <= confidence.highCoverage, {
    message: "mediumCoverage must not exceed highCoverage",
    path: ["confidence"],
  });

export type ScoringConfig = z.infer<typeof scoringConfigSchema>;

export const DEFAULT_SCORING_CONFIG: ScoringConfig = scoringConfigSchema.parse({
  weights: {
    rating: 25,
    distance: 25,
    openNow: 10,
    atmosphere: 15,
    budget: 10,
    amenities: 15,
  },
  rating: {
    // Observed live Phnom Penh cafe ratings cluster at 4.1–4.8 (2026-10-16 sample).
    priorMean: 4.3,
    priorWeight: 30,
    floor: 3.5,
    ceiling: 5,
    fewReviewsThreshold: 20,
    reliableReviewCount: 50,
  },
  distance: {
    veryCloseMeters: 500,
    edgeOfRadiusRatio: 0.8,
  },
  unknownFactorScore: 0.5,
  confidence: {
    highCoverage: 0.75,
    mediumCoverage: 0.5,
  },
});
