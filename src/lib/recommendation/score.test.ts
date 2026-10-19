import { describe, expect, it } from "vitest";

import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import type { CafePlace, PriceLevel } from "@/lib/places/schemas";

import { DEFAULT_SCORING_CONFIG, scoringConfigSchema, type ScoringConfig } from "./config";
import { adjustedRating, type CafeEvidence } from "./factors";
import { recommendationSchema } from "./schemas";
import { compareRecommendations, rankCafes, scoreCafe } from "./score";

const REQUEST: DiscoveryRequest = {
  latitude: 11.553,
  longitude: 104.925,
  radiusMeters: 3000,
  purpose: "work",
};

const cafe = (overrides: Partial<CafePlace> & { placeId: string }): CafePlace => ({
  dataSource: "google",
  ...overrides,
});

/** A well-documented cafe: every Google-derived factor known. */
const COMPLETE = cafe({
  placeId: "complete",
  rating: 4.6,
  ratingCount: 800,
  openNow: true,
  distanceMeters: 400,
  priceLevel: "inexpensive",
});

const factorScore = (placeId: string, result: ReturnType<typeof scoreCafe>, factor: string) =>
  result.factors.find((item) => item.factor === factor)?.score;

describe("scoreCafe: weighting and unknown data", () => {
  it("produces a schema-valid recommendation", () => {
    expect(recommendationSchema.safeParse(scoreCafe(COMPLETE, REQUEST)).success).toBe(true);
  });

  it("includes only factors that apply to the request", () => {
    expect(scoreCafe(COMPLETE, REQUEST).factors.map((item) => item.factor)).toEqual([
      "rating",
      "distance",
      "openNow",
      "atmosphere",
    ]);
    expect(
      scoreCafe(COMPLETE, { ...REQUEST, budget: "under_5", preferWifi: true }).factors.map(
        (item) => item.factor,
      ),
    ).toEqual(["rating", "distance", "openNow", "atmosphere", "budget", "amenities"]);
    expect(scoreCafe(COMPLETE, { ...REQUEST, budget: "any" }).factors).toHaveLength(4);
  });

  it("computes the weighted mean with unknown factors at neutral", () => {
    const result = scoreCafe(COMPLETE, REQUEST);
    const { weights, unknownFactorScore } = DEFAULT_SCORING_CONFIG;
    const rating = factorScore("complete", result, "rating") ?? Number.NaN;
    const distance = factorScore("complete", result, "distance") ?? Number.NaN;
    const expected =
      (weights.rating * rating +
        weights.distance * distance +
        weights.openNow * 1 +
        weights.atmosphere * unknownFactorScore) /
      (weights.rating + weights.distance + weights.openNow + weights.atmosphere);

    expect(result.score).toBeCloseTo(expected, 3);
    expect(result.matchPercent).toBe(Math.round(result.score * 100));
    expect(result.coverage).toBeCloseTo(60 / 75, 4);
  });

  it("cannot reach 100% while a requested preference is unverified", () => {
    const perfect = cafe({ placeId: "p", rating: 5, ratingCount: 100_000, openNow: true, distanceMeters: 0 });
    const result = scoreCafe(perfect, REQUEST);
    expect(result.score).toBeLessThan(1);
    expect(result.unverifiedPreferences).toEqual(["Good for work or study"]);
  });

  it("neither rewards nor punishes unknown data relative to neutral", () => {
    const unknownRating = scoreCafe(cafe({ placeId: "u", openNow: true, distanceMeters: 400 }), REQUEST);
    expect(factorScore("u", unknownRating, "rating")).toBeNull();
    const neutralRatingConfig: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, weights: { ...DEFAULT_SCORING_CONFIG.weights, rating: 0 } };
    // With the rating factor unknown, the result equals the neutral midpoint blended in.
    const withoutRating = scoreCafe(cafe({ placeId: "u", openNow: true, distanceMeters: 400 }), REQUEST, neutralRatingConfig);
    const { weights } = DEFAULT_SCORING_CONFIG;
    const applicable = weights.rating + weights.distance + weights.openNow + weights.atmosphere;
    const rest = applicable - weights.rating;
    expect(unknownRating.score).toBeCloseTo((withoutRating.score * rest + 0.5 * weights.rating) / applicable, 3);
  });

  it("returns a neutral score with no data at all, never NaN", () => {
    const result = scoreCafe(cafe({ placeId: "empty" }), REQUEST);
    expect(result.score).toBe(0.5);
    expect(result.coverage).toBe(0);
    expect(result.confidence).toBe("low");
    expect(result.matchPercent).toBeNull();
  });
});

describe("scoreCafe: confidence and percentage display", () => {
  it("is high with good coverage and a reliable review count", () => {
    expect(scoreCafe(COMPLETE, REQUEST).confidence).toBe("high");
  });

  it("is medium when the review count is small", () => {
    expect(scoreCafe({ ...COMPLETE, ratingCount: 10 }, REQUEST).confidence).toBe("medium");
  });

  it("is medium when many requested preferences are unverified", () => {
    const result = scoreCafe(COMPLETE, { ...REQUEST, preferWifi: true });
    expect(result.coverage).toBeCloseTo(60 / 90, 4);
    expect(result.confidence).toBe("medium");
    expect(result.matchPercent).not.toBeNull();
  });

  it("hides the percentage when evidence is thin", () => {
    const result = scoreCafe(cafe({ placeId: "thin", distanceMeters: 300 }), REQUEST);
    expect(result.confidence).toBe("low");
    expect(result.matchPercent).toBeNull();
  });
});

describe("factor: rating (Bayesian shrinkage)", () => {
  it("does not let a few perfect reviews beat many excellent ones", () => {
    const few = scoreCafe(cafe({ placeId: "few", rating: 5, ratingCount: 3 }), REQUEST);
    const many = scoreCafe(cafe({ placeId: "many", rating: 4.7, ratingCount: 900 }), REQUEST);
    expect(factorScore("few", few, "rating")).toBeLessThan(factorScore("many", many, "rating") ?? 0);
    expect(few.cautions).toContain("Few Google reviews, so the rating is less certain");
  });

  it("pulls sparse ratings toward the prior mean", () => {
    const rating = DEFAULT_SCORING_CONFIG.rating;
    expect(adjustedRating(5, 0, rating)).toBe(rating.priorMean);
    expect(adjustedRating(5, 1_000_000, rating)).toBeCloseTo(5, 3);
    expect(adjustedRating(3, undefined, rating)).toBeGreaterThan(3);
  });

  it("treats a rating with zero reviews as unknown (contradictory data)", () => {
    const result = scoreCafe(cafe({ placeId: "z", rating: 4.9, ratingCount: 0 }), REQUEST);
    expect(factorScore("z", result, "rating")).toBeNull();
    expect(result.knownMatchReasons.join(" ")).not.toMatch(/rated/i);
  });

  it("flags low ratings", () => {
    const result = scoreCafe(cafe({ placeId: "low", rating: 3.2, ratingCount: 400 }), REQUEST);
    expect(factorScore("low", result, "rating")).toBe(0);
    expect(result.cautions).toContain("Lower Google rating (3.2)");
  });

  it("names the demo source for fixture data", () => {
    const result = scoreCafe(cafe({ placeId: "d", rating: 4.8, ratingCount: 500, dataSource: "fixture" }), REQUEST);
    expect(result.knownMatchReasons).toContain("Highly rated by many demo reviewers");
  });
});

describe("factor: distance", () => {
  it.each([
    [0, 1],
    [1500, 0.5],
    [3000, 0],
    [4000, 0],
  ])("%d m in a 3 km search scores %d", (distanceMeters, expected) => {
    const result = scoreCafe(cafe({ placeId: "d", distanceMeters }), REQUEST);
    expect(factorScore("d", result, "distance")).toBeCloseTo(expected, 4);
  });

  it("explains closeness and the edge of the search area", () => {
    expect(scoreCafe(cafe({ placeId: "a", distanceMeters: 300 }), REQUEST).knownMatchReasons).toContain("Very close to you");
    expect(scoreCafe(cafe({ placeId: "b", distanceMeters: 1200 }), REQUEST).knownMatchReasons).toContain("Close to you");
    expect(scoreCafe(cafe({ placeId: "c", distanceMeters: 2800 }), REQUEST).cautions).toContain("Near the edge of your search area");
  });
});

describe("factor: open now", () => {
  it("scores open 1, closed 0 and unknown as null", () => {
    expect(factorScore("o", scoreCafe(cafe({ placeId: "o", openNow: true }), REQUEST), "openNow")).toBe(1);
    expect(factorScore("c", scoreCafe(cafe({ placeId: "c", openNow: false }), REQUEST), "openNow")).toBe(0);
    const unknown = scoreCafe(cafe({ placeId: "u" }), REQUEST);
    expect(factorScore("u", unknown, "openNow")).toBeNull();
    expect(unknown.cautions).toContain("Opening hours unknown");
    expect(unknown.cautions.join(" ")).not.toMatch(/closed/i);
  });

  it("trusts a temporary closure over a contradictory openNow", () => {
    const result = scoreCafe(cafe({ placeId: "t", openNow: true, businessStatus: "closed_temporarily" }), REQUEST);
    expect(factorScore("t", result, "openNow")).toBe(0);
    expect(result.knownMatchReasons.join(" ")).not.toMatch(/open now/i);
    expect(result.cautions).toContain("Listed as temporarily closed (according to Google)");
  });
});

describe("factor: budget (price level as a soft signal)", () => {
  const budgetScore = (priceLevel: PriceLevel | undefined, budget: DiscoveryRequest["budget"]) =>
    factorScore("b", scoreCafe(cafe({ placeId: "b", priceLevel }), { ...REQUEST, budget }), "budget");

  it("maps price level to budget fit", () => {
    expect(budgetScore("inexpensive", "under_5")).toBe(1);
    expect(budgetScore("very_expensive", "under_5")).toBe(0);
    expect(budgetScore("moderate", "5_to_10")).toBe(1);
    expect(budgetScore("expensive", "over_10")).toBe(1);
  });

  it("is unknown without a price level and listed as unverified", () => {
    const result = scoreCafe(cafe({ placeId: "b" }), { ...REQUEST, budget: "under_5" });
    expect(factorScore("b", result, "budget")).toBeNull();
    expect(result.unverifiedPreferences).toContain("Budget Under $5");
  });

  it("never claims exact prices", () => {
    const fits = scoreCafe(cafe({ placeId: "f", priceLevel: "inexpensive" }), { ...REQUEST, budget: "under_5" });
    expect(fits.knownMatchReasons).toContain(
      "Google price level suggests it fits your budget (not exact menu prices)",
    );
    const over = scoreCafe(cafe({ placeId: "o", priceLevel: "expensive" }), { ...REQUEST, budget: "under_5" });
    expect(over.cautions).toContain("Google price level suggests it may be above your budget");
    expect([...fits.knownMatchReasons, ...over.cautions].join(" ")).not.toMatch(/\$\d/);
  });
});

describe("factors: atmosphere and amenities (evidence only)", () => {
  it("never claims Wi-Fi, quiet or atmosphere without evidence", () => {
    const result = scoreCafe(COMPLETE, { ...REQUEST, preferWifi: true, preferQuiet: true, purpose: "date" });
    const text = [...result.knownMatchReasons, ...result.cautions].join(" ");
    expect(text).not.toMatch(/wi-?fi|quiet|date/i);
    expect(result.unverifiedPreferences).toEqual(["Good for a date", "Wi-Fi", "Quiet"]);
    expect(factorScore("complete", result, "amenities")).toBeNull();
    expect(factorScore("complete", result, "atmosphere")).toBeNull();
  });

  const signal = (score: number, detail = "2 reports") => ({ score, detail });

  it("uses graded member evidence, citing its source and provenance", () => {
    const evidence: CafeEvidence = {
      sourceLabel: "Cafe Finder members",
      purposeFit: { work: signal(0.9, "3 member reports on laptop-friendly") },
      wifi: signal(1, "2 reports, 1 confirmed visit, latest Oct 2026"),
      quiet: signal(0, "2 reports, latest Sep 2026"),
    };
    const result = scoreCafe(COMPLETE, { ...REQUEST, preferWifi: true, preferQuiet: true }, DEFAULT_SCORING_CONFIG, evidence);
    expect(factorScore("complete", result, "atmosphere")).toBe(0.9);
    expect(factorScore("complete", result, "amenities")).toBe(0.5);
    expect(result.knownMatchReasons).toEqual(
      expect.arrayContaining([
        "Good for work or study, according to Cafe Finder members: 3 member reports on laptop-friendly",
        "Wi-Fi reported (Cafe Finder members: 2 reports, 1 confirmed visit, latest Oct 2026)",
      ]),
    );
    expect(result.cautions).toContain("Reported as loud (Cafe Finder members: 2 reports, latest Sep 2026)");
    expect(result.unverifiedPreferences).toEqual([]);
  });

  it.each([
    [0.5, "Wi-Fi not reliably available", "Not reliably quiet", "Partly good for work or study"],
  ])("states middling evidence (%d) honestly", (score, wifiText, quietText, workText) => {
    const evidence: CafeEvidence = {
      sourceLabel: "Cafe Finder members",
      purposeFit: { work: signal(score) },
      wifi: signal(score),
      quiet: signal(score),
    };
    const result = scoreCafe(COMPLETE, { ...REQUEST, preferWifi: true, preferQuiet: true }, DEFAULT_SCORING_CONFIG, evidence);
    const cautions = result.cautions.join(" | ");
    for (const text of [wifiText, quietText, workText]) expect(cautions).toContain(text);
    expect(result.knownMatchReasons.join(" ")).not.toMatch(/wi-?fi|quiet|work/i);
  });

  it("clamps out-of-range signals", () => {
    const result = scoreCafe(COMPLETE, { ...REQUEST, preferWifi: true }, DEFAULT_SCORING_CONFIG, {
      sourceLabel: "x",
      wifi: signal(7),
    });
    expect(factorScore("complete", result, "amenities")).toBe(1);
  });

  it("ignores evidence for preferences that were not requested", () => {
    const result = scoreCafe(COMPLETE, REQUEST, DEFAULT_SCORING_CONFIG, { sourceLabel: "x", wifi: signal(1) });
    expect(result.factors.map((item) => item.factor)).not.toContain("amenities");
    expect(result.knownMatchReasons.join(" ")).not.toMatch(/wi-?fi/i);
  });
});

describe("rankCafes", () => {
  it("orders by score, best first", () => {
    const ranked = rankCafes(
      [
        cafe({ placeId: "far-closed", rating: 4.2, ratingCount: 300, openNow: false, distanceMeters: 2800 }),
        COMPLETE,
        cafe({ placeId: "mid", rating: 4.4, ratingCount: 300, openNow: true, distanceMeters: 1500 }),
      ],
      REQUEST,
    );
    expect(ranked.map((item) => item.cafe.placeId)).toEqual(["complete", "mid", "far-closed"]);
  });

  it("breaks ties by distance, then place ID, regardless of input order", () => {
    const twin = (placeId: string, distanceMeters?: number) =>
      cafe({ placeId, rating: 4.5, ratingCount: 300, openNow: true, distanceMeters });
    // Equal scores: distance 0 and an unknown distance both score 1 vs neutral differently,
    // so use identical distances for exact ties.
    const input = [twin("c", 500), twin("a", 500), twin("b", 500)];
    expect(rankCafes(input, REQUEST).map((item) => item.cafe.placeId)).toEqual(["a", "b", "c"]);
    expect(rankCafes([...input].reverse(), REQUEST).map((item) => item.cafe.placeId)).toEqual(["a", "b", "c"]);
  });

  it("uses distance as the tiebreaker before place ID", () => {
    const a = scoreCafe(cafe({ placeId: "z", distanceMeters: 100 }), REQUEST);
    const b = scoreCafe(cafe({ placeId: "a", distanceMeters: 200 }), REQUEST);
    const tied = { ...b, score: a.score };
    expect([tied, a].sort(compareRecommendations).map((item) => item.cafe.placeId)).toEqual(["z", "a"]);
  });

  it("does not mutate its input and returns an empty list for no cafes", () => {
    const input = [COMPLETE];
    const snapshot = structuredClone(input);
    rankCafes(input, REQUEST);
    expect(input).toEqual(snapshot);
    expect(rankCafes([], REQUEST)).toEqual([]);
  });

  it("honours a custom weight configuration", () => {
    const nearButMediocre = cafe({ placeId: "near", rating: 4.0, ratingCount: 500, distanceMeters: 100, openNow: true });
    const farButExcellent = cafe({ placeId: "far", rating: 4.9, ratingCount: 500, distanceMeters: 2500, openNow: true });
    const ratingFirst = scoringConfigSchema.parse({
      ...DEFAULT_SCORING_CONFIG,
      weights: { ...DEFAULT_SCORING_CONFIG.weights, rating: 60, distance: 5 },
    });
    const distanceFirst = scoringConfigSchema.parse({
      ...DEFAULT_SCORING_CONFIG,
      weights: { ...DEFAULT_SCORING_CONFIG.weights, rating: 5, distance: 60 },
    });
    expect(rankCafes([nearButMediocre, farButExcellent], REQUEST, { config: ratingFirst })[0]?.cafe.placeId).toBe("far");
    expect(rankCafes([nearButMediocre, farButExcellent], REQUEST, { config: distanceFirst })[0]?.cafe.placeId).toBe("near");
  });

  it("applies evidence by place ID", () => {
    const ranked = rankCafes([COMPLETE], { ...REQUEST, preferWifi: true }, {
      evidenceByPlaceId: new Map([["complete", { sourceLabel: "Cafe Finder members", wifi: { score: 1, detail: "2 reports" } }]]),
    });
    expect(ranked[0]?.knownMatchReasons).toContain("Wi-Fi reported (Cafe Finder members: 2 reports)");
  });
});

describe("scoringConfigSchema", () => {
  it("accepts the defaults", () => {
    expect(scoringConfigSchema.safeParse(DEFAULT_SCORING_CONFIG).success).toBe(true);
  });

  it.each([
    ["negative weight", { weights: { ...DEFAULT_SCORING_CONFIG.weights, rating: -1 } }],
    ["all-zero weights", { weights: { rating: 0, distance: 0, openNow: 0, atmosphere: 0, budget: 0, amenities: 0 } }],
    ["inverted rating range", { rating: { ...DEFAULT_SCORING_CONFIG.rating, floor: 5, ceiling: 4 } }],
    ["unknown score above 1", { unknownFactorScore: 1.5 }],
    ["medium above high", { confidence: { highCoverage: 0.5, mediumCoverage: 0.9 } }],
    ["unknown key", { weights: { ...DEFAULT_SCORING_CONFIG.weights, vibes: 10 } }],
  ])("rejects %s", (_label, override) => {
    expect(scoringConfigSchema.safeParse({ ...DEFAULT_SCORING_CONFIG, ...override }).success).toBe(false);
  });
});

/** Deterministic pseudo-random generator (mulberry32) for invariant checks. */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("invariants over generated cafes", () => {
  const random = seeded(20261016);
  const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)] as T;
  const maybe = <T,>(value: T) => (random() < 0.3 ? undefined : value);
  const priceLevels: PriceLevel[] = ["free", "inexpensive", "moderate", "expensive", "very_expensive"];

  const cafes: CafePlace[] = Array.from({ length: 2000 }, (_, index) => ({
    placeId: `gen-${index}`,
    rating: maybe(Math.round(random() * 50) / 10),
    ratingCount: maybe(Math.floor(random() * 3000)),
    openNow: maybe(random() < 0.5),
    distanceMeters: maybe(Math.floor(random() * 16_000)),
    priceLevel: maybe(pick(priceLevels)),
    businessStatus: maybe(pick(["operational", "closed_temporarily"] as const)),
    dataSource: "google",
  }));
  const requests: DiscoveryRequest[] = [
    REQUEST,
    { ...REQUEST, radiusMeters: 15_000, purpose: "date", budget: "over_10", preferQuiet: true },
    { ...REQUEST, radiusMeters: 1_000, purpose: "friends", budget: "under_5", preferWifi: true },
  ];

  it("always yields bounded, finite, schema-valid, evidence-backed results", () => {
    for (const request of requests) {
      for (const item of rankCafes(cafes, request)) {
        expect(recommendationSchema.safeParse(item).success).toBe(true);
        expect(Number.isFinite(item.score)).toBe(true);
        const reasons = item.knownMatchReasons.join(" ");
        // No reason may cite something the cafe lacks data for.
        if (item.cafe.openNow !== true) expect(reasons).not.toMatch(/open now/i);
        if (item.cafe.rating === undefined) expect(reasons).not.toMatch(/rated/i);
        if (item.cafe.distanceMeters === undefined) expect(reasons).not.toMatch(/close to you/i);
        if (item.cafe.priceLevel === undefined) expect(reasons).not.toMatch(/price/i);
        expect(reasons).not.toMatch(/wi-?fi|quiet|atmosphere|good for/i);
      }
    }
  });

  it("is deterministic", () => {
    const first = rankCafes(cafes, requests[1] as DiscoveryRequest).map((item) => item.cafe.placeId);
    const second = rankCafes([...cafes].reverse(), requests[1] as DiscoveryRequest).map((item) => item.cafe.placeId);
    expect(second).toEqual(first);
  });
});

describe("reason wording", () => {
  it("phrases mid-range ratings naturally for each source", () => {
    const mid = { rating: 4.4, ratingCount: 300 };
    expect(scoreCafe(cafe({ placeId: "g", ...mid }), REQUEST).knownMatchReasons).toContain("Well rated on Google");
    expect(
      scoreCafe(cafe({ placeId: "f", ...mid, dataSource: "fixture" }), REQUEST).knownMatchReasons,
    ).toContain("Well rated in demo data");
  });
});
