import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import type { CafePlace } from "@/lib/places/schemas";

import { DEFAULT_SCORING_CONFIG, type ScoringConfig } from "./config";
import { assessFactors, type CafeEvidence, type FactorAssessment } from "./factors";
import type { Confidence, Recommendation } from "./schemas";

export type RankOptions = {
  config?: ScoringConfig;
  /** Optional non-Google evidence per place ID (community reports, M6). */
  evidenceByPlaceId?: ReadonlyMap<string, CafeEvidence>;
};

const SCORE_DECIMALS = 4;
const roundScore = (value: number) => Number(value.toFixed(SCORE_DECIMALS));

/** Positive reasons, cautions and unverified preferences, in factor order. */
export function buildMatchReasons(assessments: readonly FactorAssessment[]) {
  return {
    knownMatchReasons: assessments.flatMap((item) => item.reasons),
    cautions: assessments.flatMap((item) => item.cautions),
    unverifiedPreferences: assessments.flatMap((item) => item.unverified),
  };
}

function confidenceFor(
  coverage: number,
  cafe: CafePlace,
  config: ScoringConfig,
): Confidence {
  const reliableRating =
    cafe.rating !== undefined &&
    cafe.ratingCount !== undefined &&
    cafe.ratingCount >= config.rating.reliableReviewCount;
  if (coverage >= config.confidence.highCoverage && reliableRating) return "high";
  if (coverage >= config.confidence.mediumCoverage) return "medium";
  return "low";
}

/**
 * Weighted score over the factors that apply to the request.
 *
 * score    = Σ wᵢ·sᵢ / Σ wᵢ, where unknown factors use `unknownFactorScore` (neutral)
 * coverage = Σ wᵢ (known) / Σ wᵢ (applicable)
 *
 * Unknown data is neither rewarded nor punished: it sits at the midpoint, so
 * no cafe reaches 100% while something it was asked about is unverified.
 * The percentage is withheld when confidence is low.
 */
export function scoreCafe(
  cafe: CafePlace,
  request: DiscoveryRequest,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
  evidence?: CafeEvidence,
): Recommendation {
  const assessments = assessFactors(cafe, request, config, evidence);

  let weightedSum = 0;
  let totalWeight = 0;
  let knownWeight = 0;
  for (const { factor, score } of assessments) {
    const weight = config.weights[factor];
    totalWeight += weight;
    if (score !== null) knownWeight += weight;
    weightedSum += weight * (score ?? config.unknownFactorScore);
  }

  const score = totalWeight > 0 ? roundScore(weightedSum / totalWeight) : config.unknownFactorScore;
  const coverage = totalWeight > 0 ? roundScore(knownWeight / totalWeight) : 0;
  const confidence = confidenceFor(coverage, cafe, config);

  return {
    cafe,
    score,
    matchPercent: confidence === "low" ? null : Math.round(score * 100),
    confidence,
    coverage,
    factors: assessments.map(({ factor, score: factorScore }) => ({
      factor,
      weight: config.weights[factor],
      score: factorScore === null ? null : roundScore(factorScore),
    })),
    ...buildMatchReasons(assessments),
  };
}

/** Deterministic order: score desc, then distance asc (unknown last), then place ID. */
export function compareRecommendations(a: Recommendation, b: Recommendation): number {
  if (a.score !== b.score) return b.score - a.score;
  const da = a.cafe.distanceMeters ?? Number.POSITIVE_INFINITY;
  const db = b.cafe.distanceMeters ?? Number.POSITIVE_INFINITY;
  if (da !== db) return da < db ? -1 : 1;
  return a.cafe.placeId < b.cafe.placeId ? -1 : a.cafe.placeId > b.cafe.placeId ? 1 : 0;
}

export function rankCafes(
  cafes: readonly CafePlace[],
  request: DiscoveryRequest,
  { config = DEFAULT_SCORING_CONFIG, evidenceByPlaceId }: RankOptions = {},
): Recommendation[] {
  return cafes
    .map((cafe) => scoreCafe(cafe, request, config, evidenceByPlaceId?.get(cafe.placeId)))
    .sort(compareRecommendations);
}
