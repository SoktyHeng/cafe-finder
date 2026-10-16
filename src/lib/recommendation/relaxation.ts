import type { DiscoveryRequest } from "@/lib/discovery/request-schema";
import type { ExcludedCounts } from "@/lib/places/schemas";

/** Radius steps offered when widening a search, in meters. */
export const RADIUS_STEPS_METERS = [3_000, 5_000, 10_000, 15_000] as const;

export type RelaxationChange =
  | { kind: "removeMinRating" }
  | { kind: "includeClosed" }
  | { kind: "widenRadius"; radiusMeters: number };

export type Relaxation = {
  change: RelaxationChange;
  label: string;
  /** Cafes this change is known to bring back, when the server counted them. */
  knownExtraResults?: number;
};

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * One-click ways to loosen a search that found nothing (or little). Each
 * suggestion is a new explicit search: nothing runs until the user picks one.
 */
export function suggestRelaxations(
  request: Pick<DiscoveryRequest, "minRating" | "openNowOnly" | "radiusMeters">,
  excluded: ExcludedCounts,
  maxRadiusMeters: number,
): Relaxation[] {
  const suggestions: Relaxation[] = [];

  if (request.minRating !== undefined && excluded.belowMinRating > 0) {
    suggestions.push({
      change: { kind: "removeMinRating" },
      label: `Include ${plural(excluded.belowMinRating, "cafe")} rated below ${request.minRating.toFixed(1)}`,
      knownExtraResults: excluded.belowMinRating,
    });
  }
  if (request.openNowOnly && excluded.closedNow > 0) {
    suggestions.push({
      change: { kind: "includeClosed" },
      label: `Include ${plural(excluded.closedNow, "cafe")} closed right now`,
      knownExtraResults: excluded.closedNow,
    });
  }
  const nextRadius = RADIUS_STEPS_METERS.find(
    (step) => step > request.radiusMeters && step <= maxRadiusMeters,
  );
  if (nextRadius !== undefined) {
    suggestions.push({
      change: { kind: "widenRadius", radiusMeters: nextRadius },
      label: `Search within ${nextRadius / 1000} km`,
    });
  }
  return suggestions;
}
