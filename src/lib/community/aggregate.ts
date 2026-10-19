import type { Purpose } from "@/lib/discovery/request-schema";
import type { CafeEvidence, EvidenceSignal } from "@/lib/recommendation/factors";

import {
  AMENITY_OPTIONS,
  COMMUNITY_AMENITIES,
  amenityValueOption,
  type AmenitySummary,
  type CommunityAmenity,
  type CommunityReport,
} from "./schemas";

/**
 * Trust model for member reports (initial hypotheses, documented in
 * docs/recommendation-scoring.md):
 * - a report from someone who marked the place as visited counts fully, others half;
 * - older observations count less (half-life of 180 days; the DB returns at most a year);
 * - an amenity needs a total weight of at least 1 (e.g. one recent confirmed
 *   visit, or two recent unconfirmed reports) before it influences ranking;
 * - under 60% agreement on one value is "mixed reports".
 */
export const COMMUNITY_TRUST = {
  confirmedVisitWeight: 1,
  unconfirmedWeight: 0.5,
  halfLifeDays: 180,
  minEvidenceWeight: 1,
  consensusThreshold: 0.6,
} as const;

export const COMMUNITY_SOURCE_LABEL = "Cafe Finder members";

const DAY_MS = 86_400_000;

/** Whole days since the observation (dates have no time, so same-day reports are age 0). */
function ageDays(observedOn: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(`${observedOn}T00:00:00Z`)) / DAY_MS));
}

export function reportWeight(report: Pick<CommunityReport, "confirmedVisit" | "observedOn">, now: Date): number {
  const base = report.confirmedVisit ? COMMUNITY_TRUST.confirmedVisitWeight : COMMUNITY_TRUST.unconfirmedWeight;
  return base * 0.5 ** (ageDays(report.observedOn, now) / COMMUNITY_TRUST.halfLifeDays);
}

const round = (value: number) => Number(value.toFixed(4));

/** Summaries per place and amenity. Invalid values are ignored defensively. */
export function aggregateReports(
  reports: readonly CommunityReport[],
  now: Date,
): Map<string, AmenitySummary[]> {
  type Bucket = { weights: Map<string, number>; total: number; scoreSum: number; count: number; confirmed: number; latest: string };
  const buckets = new Map<string, Map<CommunityAmenity, Bucket>>();

  for (const report of reports) {
    const option = amenityValueOption(report.amenity, report.value);
    if (!option || Number.isNaN(Date.parse(report.observedOn))) continue;
    const weight = reportWeight(report, now);
    let place = buckets.get(report.placeId);
    if (!place) buckets.set(report.placeId, (place = new Map()));
    let bucket = place.get(report.amenity);
    if (!bucket) {
      bucket = { weights: new Map(), total: 0, scoreSum: 0, count: 0, confirmed: 0, latest: report.observedOn };
      place.set(report.amenity, bucket);
    }
    bucket.weights.set(report.value, (bucket.weights.get(report.value) ?? 0) + weight);
    bucket.total += weight;
    bucket.scoreSum += weight * option.score;
    bucket.count += 1;
    if (report.confirmedVisit) bucket.confirmed += 1;
    if (report.observedOn > bucket.latest) bucket.latest = report.observedOn;
  }

  const result = new Map<string, AmenitySummary[]>();
  for (const [placeId, amenities] of buckets) {
    const summaries: AmenitySummary[] = [];
    for (const amenity of COMMUNITY_AMENITIES) {
      const bucket = amenities.get(amenity);
      if (!bucket || bucket.total <= 0) continue;
      // Highest weight wins; ties break by the value's position in AMENITY_OPTIONS (deterministic).
      const order = Object.keys(AMENITY_OPTIONS[amenity].values);
      const [consensus, consensusWeight] = [...bucket.weights.entries()].sort(
        (a, b) => b[1] - a[1] || order.indexOf(a[0]) - order.indexOf(b[0]),
      )[0] as [string, number];
      const agreement = consensusWeight / bucket.total;
      summaries.push({
        amenity,
        consensus,
        agreement: round(agreement),
        score: round(bucket.scoreSum / bucket.total),
        reportCount: bucket.count,
        confirmedVisitCount: bucket.confirmed,
        latestObservedOn: bucket.latest,
        conflicted: agreement < COMMUNITY_TRUST.consensusThreshold,
        sufficient: bucket.total >= COMMUNITY_TRUST.minEvidenceWeight,
      });
    }
    result.set(placeId, summaries);
  }
  return result;
}

const monthYear = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" });

/** "3 reports, 1 confirmed visit, latest Oct 2026" */
export function describeSummary(summary: AmenitySummary): string {
  const parts = [`${summary.reportCount} ${summary.reportCount === 1 ? "report" : "reports"}`];
  if (summary.confirmedVisitCount > 0) {
    parts.push(`${summary.confirmedVisitCount} confirmed ${summary.confirmedVisitCount === 1 ? "visit" : "visits"}`);
  }
  parts.push(`latest ${monthYear.format(new Date(`${summary.latestObservedOn}T00:00:00Z`))}`);
  return parts.join(", ");
}

const signal = (summary: AmenitySummary): EvidenceSignal => ({
  score: summary.score,
  detail: describeSummary(summary),
});

function combine(summaries: (AmenitySummary | undefined)[]): EvidenceSignal | undefined {
  const usable = summaries.filter((summary): summary is AmenitySummary => summary !== undefined);
  if (usable.length === 0) return undefined;
  const reports = usable.reduce((sum, summary) => sum + summary.reportCount, 0);
  return {
    score: round(usable.reduce((sum, summary) => sum + summary.score, 0) / usable.length),
    detail: `${reports} member ${reports === 1 ? "report" : "reports"} on ${usable
      .map((summary) => AMENITY_OPTIONS[summary.amenity].label.toLowerCase())
      .join(", ")}`,
  };
}

/**
 * Converts sufficient member evidence into scorer evidence. Only amenities
 * with enough weight count; purposes are derived only where reports are
 * directly relevant (work: laptop-friendliness, outlets, Wi-Fi; relax:
 * noise, seating). Friends and date stay unknown: no report type speaks to them.
 */
export function toCafeEvidence(summaries: readonly AmenitySummary[]): CafeEvidence | undefined {
  const usable = new Map(summaries.filter((summary) => summary.sufficient).map((summary) => [summary.amenity, summary]));
  if (usable.size === 0) return undefined;

  const purposeFit: Partial<Record<Purpose, EvidenceSignal>> = {};
  const work = combine([usable.get("laptop_friendly"), usable.get("outlets"), usable.get("wifi")]);
  const relax = combine([usable.get("noise"), usable.get("seating")]);
  if (work) purposeFit.work = work;
  if (relax) purposeFit.relax = relax;

  const wifi = usable.get("wifi");
  const noise = usable.get("noise");
  return {
    sourceLabel: COMMUNITY_SOURCE_LABEL,
    ...(Object.keys(purposeFit).length > 0 && { purposeFit }),
    ...(wifi && { wifi: signal(wifi) }),
    ...(noise && { quiet: signal(noise) }),
  };
}
