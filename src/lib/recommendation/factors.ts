import { budgetLabel, purposeOption } from "@/lib/discovery/options";
import type { Budget, DiscoveryRequest, Purpose } from "@/lib/discovery/request-schema";
import type { CafePlace, PriceLevel } from "@/lib/places/schemas";

import type { Factor, ScoringConfig } from "./config";

/**
 * Evidence about a cafe that Google's standard fields don't provide. No source
 * exists yet; community reports (M6) will fill it. Until then every
 * atmosphere and amenity preference is "not verified".
 */
export type CafeEvidence = {
  /** Label shown in reasons, e.g. "community reports". */
  sourceLabel: string;
  purposeFit?: Partial<Record<Purpose, boolean>>;
  wifi?: boolean;
  quiet?: boolean;
};

/** What one factor concluded, with the evidence-backed text that explains it. */
export type FactorAssessment = {
  factor: Factor;
  /** 0–1 from evidence, or `null` when unknown. */
  score: number | null;
  reasons: string[];
  cautions: string[];
  unverified: string[];
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const assessment = (factor: Factor, score: number | null, text: Partial<FactorAssessment> = {}) => ({
  factor,
  score,
  reasons: text.reasons ?? [],
  cautions: text.cautions ?? [],
  unverified: text.unverified ?? [],
});

/**
 * Bayesian-adjusted rating: sparse ratings are pulled toward `priorMean`, so
 * 5.0 from 3 reviews does not beat 4.7 from 900. A rating with an unknown
 * review count is treated as a single review.
 */
export function adjustedRating(
  rating: number,
  ratingCount: number | undefined,
  { priorMean, priorWeight }: ScoringConfig["rating"],
): number {
  const count = ratingCount ?? 1;
  return (count * rating + priorWeight * priorMean) / (count + priorWeight);
}

export function assessRating(cafe: CafePlace, config: ScoringConfig): FactorAssessment {
  const { rating, ratingCount } = cafe;
  // A rating with zero reviews is contradictory, so treat it as unknown.
  if (rating === undefined || ratingCount === 0) {
    return assessment("rating", null, { cautions: ["No ratings yet"] });
  }
  const { floor, ceiling, fewReviewsThreshold, reliableReviewCount } = config.rating;
  const score = clamp01((adjustedRating(rating, ratingCount, config.rating) - floor) / (ceiling - floor));

  const reasons: string[] = [];
  const cautions: string[] = [];
  const source = cafe.dataSource === "google" ? "Google" : "demo";
  if (ratingCount === undefined || ratingCount < fewReviewsThreshold) {
    cautions.push(`Few ${source} reviews, so the rating is less certain`);
  }
  if (score >= 0.7 && ratingCount !== undefined && ratingCount >= reliableReviewCount) {
    reasons.push(`Highly rated by many ${source} reviewers`);
  } else if (score >= 0.5) {
    reasons.push(cafe.dataSource === "google" ? "Well rated on Google" : "Well rated in demo data");
  }
  if (rating < 3.8) {
    cautions.push(`Lower ${source} rating (${rating.toFixed(1)})`);
  }
  return assessment("rating", score, { reasons, cautions });
}

export function assessDistance(
  cafe: CafePlace,
  radiusMeters: number,
  config: ScoringConfig,
): FactorAssessment {
  if (cafe.distanceMeters === undefined) {
    return assessment("distance", null, { cautions: ["Distance unknown"] });
  }
  const ratio = cafe.distanceMeters / radiusMeters;
  const reasons: string[] = [];
  const cautions: string[] = [];
  if (cafe.distanceMeters <= config.distance.veryCloseMeters) {
    reasons.push("Very close to you");
  } else if (ratio <= 0.5) {
    reasons.push("Close to you");
  }
  if (ratio > config.distance.edgeOfRadiusRatio) {
    cautions.push("Near the edge of your search area");
  }
  return assessment("distance", clamp01(1 - ratio), { reasons, cautions });
}

export function assessOpenNow(cafe: CafePlace): FactorAssessment {
  const source = cafe.dataSource === "google" ? "Google" : "demo data";
  // Business status wins over a contradictory `openNow: true`.
  if (cafe.businessStatus === "closed_temporarily" || cafe.businessStatus === "closed_permanently") {
    return assessment("openNow", 0, {
      cautions: [`Listed as ${cafe.businessStatus === "closed_temporarily" ? "temporarily" : "permanently"} closed (according to ${source})`],
    });
  }
  if (cafe.openNow === true) {
    return assessment("openNow", 1, { reasons: [`Open now (according to ${source})`] });
  }
  if (cafe.openNow === false) {
    return assessment("openNow", 0, { cautions: [`Closed now (according to ${source})`] });
  }
  return assessment("openNow", null, { cautions: ["Opening hours unknown"] });
}

export function assessAtmosphere(purpose: Purpose, evidence: CafeEvidence | undefined): FactorAssessment {
  const { atmosphere } = purposeOption(purpose);
  const fit = evidence?.purposeFit?.[purpose];
  if (fit === true) {
    return assessment("atmosphere", 1, { reasons: [`${atmosphere} (${evidence?.sourceLabel})`] });
  }
  if (fit === false) {
    return assessment("atmosphere", 0, {
      cautions: [`Reported as not ${atmosphere.toLowerCase()} (${evidence?.sourceLabel})`],
    });
  }
  return assessment("atmosphere", null, { unverified: [atmosphere] });
}

type RequestedBudget = Exclude<Budget, "any">;

/**
 * How well Google's qualitative price level fits a USD budget tier. This is a
 * soft signal: price level is not a menu price, and the explanations say so.
 */
const PRICE_FIT: Record<RequestedBudget, Record<PriceLevel, number>> = {
  under_5: { free: 1, inexpensive: 1, moderate: 0.5, expensive: 0.1, very_expensive: 0 },
  "5_to_10": { free: 0.7, inexpensive: 0.7, moderate: 1, expensive: 0.5, very_expensive: 0.2 },
  over_10: { free: 0.5, inexpensive: 0.5, moderate: 0.7, expensive: 1, very_expensive: 1 },
};

export function assessBudget(cafe: CafePlace, budget: RequestedBudget): FactorAssessment {
  const label = `Budget ${budgetLabel(budget)}`;
  if (cafe.priceLevel === undefined) {
    return assessment("budget", null, { unverified: [label] });
  }
  const score = PRICE_FIT[budget][cafe.priceLevel];
  const source = cafe.dataSource === "google" ? "Google" : "Demo";
  if (score >= 0.7) {
    return assessment("budget", score, {
      reasons: [`${source} price level suggests it fits your budget (not exact menu prices)`],
    });
  }
  if (score <= 0.3) {
    return assessment("budget", score, {
      // With PRICE_FIT, scores ≤ 0.3 only occur when the price level is higher than the budget.
      cautions: [`${source} price level suggests it may be above your budget`],
    });
  }
  return assessment("budget", score);
}

export function assessAmenities(
  request: Pick<DiscoveryRequest, "preferWifi" | "preferQuiet">,
  evidence: CafeEvidence | undefined,
): FactorAssessment {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const unverified: string[] = [];
  const known: number[] = [];
  const check = (wanted: boolean | undefined, value: boolean | undefined, name: string) => {
    if (!wanted) return;
    if (value === undefined) {
      unverified.push(name);
      return;
    }
    known.push(value ? 1 : 0);
    if (value) reasons.push(`${name} reported (${evidence?.sourceLabel})`);
    else cautions.push(`No ${name.toLowerCase()} reported (${evidence?.sourceLabel})`);
  };
  check(request.preferWifi, evidence?.wifi, "Wi-Fi");
  check(request.preferQuiet, evidence?.quiet, "Quiet");

  const score = known.length > 0 ? known.reduce((sum, value) => sum + value, 0) / known.length : null;
  return assessment("amenities", score, { reasons, cautions, unverified });
}

/** All factors that apply to this request, in a fixed order. */
export function assessFactors(
  cafe: CafePlace,
  request: DiscoveryRequest,
  config: ScoringConfig,
  evidence?: CafeEvidence,
): FactorAssessment[] {
  const factors = [
    assessRating(cafe, config),
    assessDistance(cafe, request.radiusMeters, config),
    assessOpenNow(cafe),
    assessAtmosphere(request.purpose, evidence),
  ];
  if (request.budget !== undefined && request.budget !== "any") {
    factors.push(assessBudget(cafe, request.budget));
  }
  if (request.preferWifi || request.preferQuiet) {
    factors.push(assessAmenities(request, evidence));
  }
  return factors;
}
