# Recommendation scoring

Implementation: [src/lib/recommendation/](../src/lib/recommendation/). It is pure and deterministic, and has no I/O.

| Module | Role |
|---|---|
| `filters.ts` | Hard filters (`applyHardFilters`), de-duplication and straight-line distance |
| `config.ts` | Weights and thresholds (`DEFAULT_SCORING_CONFIG`), validated by `scoringConfigSchema` |
| `factors.ts` | One assessment per factor: a score from 0 to 1 or `null` (unknown), plus evidence-backed text |
| `score.ts` | `scoreCafe`, `rankCafes`, `buildMatchReasons`, `compareRecommendations` |
| `relaxation.ts` | One-click suggestions for empty results (`suggestRelaxations`) |

## Pipeline

1. **Hard filters** (from M1) remove only positive evidence of a mismatch: permanently closed, rated below the minimum, closed now with "open now only". Unknown values are kept.
2. **Score** every remaining cafe on the factors that apply to the request.
3. **Rank**: score descending, then straight-line distance ascending (unknown last), then place ID. The order is fully deterministic.

## Factors

The weights are initial hypotheses, not calibrated values. Change them in `config.ts`; only the ratios matter.

| Factor | Default weight | Applies when | Evidence | 0–1 score |
|---|---|---|---|---|
| Rating | 25 | Always | Google `rating` and `userRatingCount` | Bayesian-adjusted rating mapped linearly from 3.5 (score 0) to 5.0 (score 1) |
| Distance | 25 | Always | Straight-line distance | `1 − distance / radius`, clamped |
| Open now | 10 | Always | `openNow` and `businessStatus` | Open 1, closed 0. Temporarily closed is 0, even if `openNow` says otherwise |
| Atmosphere | 15 | Always (purpose is required) | Explicit evidence only, e.g. community reports from M6 | Fits 1, doesn't fit 0 |
| Budget | 10 | `budget` is not `any` | Google `priceLevel`, a qualitative soft signal | Lookup table (below) |
| Wi-Fi / quiet | 15 | Wi-Fi or quiet requested | Explicit evidence only | Mean of the known requested amenities |

CLAUDE.md §7.2 proposed rating 25, distance 25, purpose 20, budget 15 and amenities 15. **Open now (10) was added** because opening status is real, cheap evidence. Purpose and budget were reduced to keep the total at 100.

### Rating: Bayesian shrinkage

`adjusted = (n·rating + m·C) / (n + m)` with prior mean `C = 4.3` and prior weight `m = 30` virtual reviews.

- A 5.0 rating from 3 reviews adjusts to about 4.36. A 4.7 rating from 900 reviews stays about 4.69. Few glowing reviews therefore don't outrank many strong ones, and new cafes are not buried.
- The prior mean is based on a live Phnom Penh sample on 2026-10-16, where 20 of 20 cafes were rated 4.1–4.8. The 3.5–5.0 scale spreads that narrow band out.
- An unknown review count is treated as 1 review. `rating` with `userRatingCount: 0` is contradictory and treated as unknown.

### Budget: price level is not a menu price

| Budget \ price level | Free | Inexpensive | Moderate | Expensive | Very expensive |
|---|---|---|---|---|---|
| Under $5 | 1 | 1 | 0.5 | 0.1 | 0 |
| $5–10 | 0.7 | 0.7 | 1 | 0.5 | 0.2 |
| Over $10 | 0.5 | 0.5 | 0.7 | 1 | 1 |

Explanations always say "price level suggests…" and "not exact menu prices". The budget is never a hard filter.

## Unknown data

```
score    = Σ wᵢ · sᵢ / Σ wᵢ      (unknown sᵢ = 0.5, neutral)
coverage = Σ wᵢ(known) / Σ wᵢ    (applicable factors only)
```

- Unknown data is **neither rewarded nor penalized**: it sits at the midpoint. A cafe with an unknown rating is treated like a typical cafe rather than a bad or perfect one.
- Because atmosphere is always unknown today, **no cafe can reach 100%**. Any requested preference that can't be checked caps the score. This is intended, because the match is genuinely uncertain.
- Unverifiable preferences such as Wi-Fi, quiet and atmosphere appear on every card as "Not verified for this cafe". They never appear as reasons.

## Confidence and the percentage

| Confidence | Rule (defaults) | Display |
|---|---|---|
| High | coverage ≥ 0.75 **and** at least 50 reviews | "86% match · High confidence" |
| Medium | coverage ≥ 0.5 | "71% match · Medium confidence" |
| Low | otherwise | **"Limited data"** with no percentage |

CLAUDE.md §7.2 cautions against "a fabricated high precision '95% match' from little evidence". The percentage is therefore a whole number, always shown with its confidence, and hidden when evidence is thin. "Best match" is shown only on the first result, and only if it has a percentage.

## Explanations

Every assessment produces three kinds of text, each tied to a field that was actually present:

- **Reasons**, for example "Highly rated by many Google reviewers" (an adjusted score of at least 0.7 and at least 50 reviews), "Very close to you" (500 m or less), "Open now (according to Google)", or "Google price level suggests it fits your budget (not exact menu prices)".
- **Cautions**, for example "Few Google reviews, so the rating is less certain" (fewer than 20), "Lower Google rating (3.4)" (below 3.8), "Near the edge of your search area" (more than 80% of the radius), "Closed now", "Listed as temporarily closed", or "Opening hours unknown".
- **Unverified preferences**: the atmosphere for the chosen purpose, a budget without a price level, Wi-Fi and quiet.

The card also shows a breakdown table ("How this match is calculated") with each factor's share of the weight and its result, or "Unknown (neutral)".

An invariant test generates 2,000 random cafes across 3 requests and checks that scores are finite and schema-valid, that no reason cites a field the cafe lacks, and that Wi-Fi, quiet and atmosphere are never claimed.

## Evidence beyond Google (future)

`scoreCafe` accepts optional `CafeEvidence` (`purposeFit`, `wifi`, `quiet`, `sourceLabel`) and `rankCafes` accepts `evidenceByPlaceId`. Nothing supplies it yet. M6 community reports will, and their reasons will name the source, for example "Wi-Fi reported (community reports)".

## Empty-state relaxation

When nothing matches, `suggestRelaxations` offers only changes that can help:
- "Include N cafes rated below X", when the rating filter excluded something;
- "Include N cafes closed right now", when the open-now filter excluded something;
- "Search within the next radius step" (3, 5, 10, 15 km), up to `MAX_SEARCH_RADIUS_METERS`.

Each option is an explicit new search, recorded in the URL.

## Tuning checklist

1. Edit `DEFAULT_SCORING_CONFIG`. Schema validation runs at import, and tests fail on invalid values.
2. Run `pnpm test`. Ordering tests (`score.test.ts`) show the effect of the change.
3. Update this document. User-facing explanation strings live in `factors.ts`.
